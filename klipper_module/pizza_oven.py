# klipper_module/pizza_oven.py
import logging
import pathlib
import math
from gcode import CommandError

# Help texts for G-code commands
PROGRAM_EXECUTE_HELP = "Execute the program assembled by ADD_SEGMENT commands"
PROGRAM_CANCEL_HELP = "Cancel execution of the current program"
PROGRAM_CLEAR_HELP = "Clear the current program from memory"
ADD_SEGMENT_HELP = "Add a program segment: TEMP, RAMP_TIME (sec), HOLD_TIME (sec)"

# Constants
TEMP_RANGE_TOLERANCE = 2 # Degrees C
AMBIENT_TEMP = 25 # Degrees C

# Ramp mode constants
NONE                = 0x00
LINEAR              = 0x01
QUADRATIC_IN        = 0x02
QUADRATIC_OUT       = 0x03
QUADRATIC_INOUT     = 0x04
CUBIC_IN            = 0x05
CUBIC_OUT           = 0x06
CUBIC_INOUT         = 0x07
QUARTIC_IN          = 0x08
QUARTIC_OUT         = 0x09
QUARTIC_INOUT       = 0x0A
QUINTIC_IN          = 0x0B
QUINTIC_OUT         = 0x0C
QUINTIC_INOUT       = 0x0D
SINUSOIDAL_IN       = 0x0E
SINUSOIDAL_OUT      = 0x0F
SINUSOIDAL_INOUT    = 0x10

def in_range(value, target, tolerance=0):
    return (value >= target - tolerance) and (value <= target + tolerance)

def powin(a, b):
    return math.pow(a, b)

def powout(a, b):
    return 1 - math.pow(1-a, b)

def powinout(a, b):
    a *= 2
    if a < 1:
        return 0.5 * math.pow(a, b)
    return 1 - 0.5 * math.fabs(math.pow(2-a, b))

def calc_temp_ramp(mode, k):
    if k <= 0: return 0
    if k >= 1: return 1
    if mode == QUADRATIC_IN: return powin(k,2)
    if mode == QUADRATIC_OUT: return powout(k,2)
    if mode == QUADRATIC_INOUT: return powinout(k,2)
    if mode == CUBIC_IN: return powin(k,3)
    if mode == CUBIC_OUT: return powout(k,3)
    if mode == CUBIC_INOUT: return powinout(k,3)
    if mode == QUARTIC_IN: return powin(k,4)
    if mode == QUARTIC_OUT: return powout(k,4)
    if mode == QUARTIC_INOUT: return powinout(k,4)
    if mode == QUINTIC_IN: return powin(k,5)
    if mode == QUINTIC_OUT: return powout(k,5)
    if mode == QUINTIC_INOUT: return powinout(k,5)
    if mode == SINUSOIDAL_IN: return 1-math.cos(k*(math.pi/2))
    if mode == SINUSOIDAL_OUT: return math.sin(k*(math.pi/2))
    if mode == SINUSOIDAL_INOUT: return -0.5*(math.cos(math.pi*k)-1)
    return k

class ProgramSegment:
    def __init__(self, target, duration, method):
        self.target = target
        self.duration = duration
        self.method = method
        self.position = 0
        self._start_time = 0

    def start(self, eventtime):
        self._start_time = eventtime

    def runtime(self, eventtime):
        return round(eventtime - self._start_time)

    def is_done(self, eventtime):
        return self.runtime(eventtime) >= self.duration

class Program:
    def __init__(self):
        self._segments = []
        self._iter = 0
        self._prev_time = 0
        self._prev_temp = AMBIENT_TEMP

    def add_segment(self, target, ramp_time, hold_time):
        # Ramp segment uses LINEAR method.
        self._segments.append(ProgramSegment(target, ramp_time, LINEAR))
        # Hold segment uses NONE method, which maintains the target temperature.
        if hold_time > 0:
            self._segments.append(ProgramSegment(target, hold_time, NONE))

    def is_empty(self):
        return len(self._segments) == 0

    def is_done(self):
        return self._iter >= len(self._segments)

    def start(self, eventtime):
        self._iter = 0
        self._prev_time = eventtime
        if not self.is_done():
            self._segments[self._iter].start(eventtime)

    def reset(self):
        self._iter = 0

    def _ramp(self, start_temp, step, delta):
        if step.method == NONE:
            return step.target
        
        step.position += delta
        if step.position > step.duration:
            step.position = step.duration
            
        k = step.position / step.duration if step.duration > 0 else 1.0
        
        temp_diff = step.target - start_temp
        return start_temp + temp_diff * calc_temp_ramp(step.method, k)

    def get_step(self, eventtime):
        if self.is_done():
            return self.get_last_target()

        step = self._segments[self._iter]
        if step.is_done(eventtime):
            self._iter += 1
            if self.is_done():
                return self.get_last_target()
            
            self._prev_temp = step.target
            step = self._segments[self._iter]
            step.start(eventtime)
        
        dt = eventtime - self._prev_time
        self._prev_time = eventtime
        return self._ramp(self._prev_temp, step, dt)
    
    def get_current_target(self):
        if not self.is_done():
            return self._segments[self._iter].target
        return self.get_last_target()

    def get_last_target(self):
        if not self._segments:
            return AMBIENT_TEMP
        return self._segments[-1].target

class PizzaOven:
    def __init__(self, config):
        self.printer = config.get_printer()
        self.reactor = self.printer.get_reactor()
        gcode = self.printer.lookup_object("gcode")
        
        self.pheaters = self.printer.load_object(config, "heaters")
        self.heater = self.pheaters.setup_heater(config)
        
        self.program = Program()
        self._prev_target = 0.
        self._running = False

        # Register new G-code commands
        gcode.register_command("PROGRAM_CLEAR", self.program_clear, desc=PROGRAM_CLEAR_HELP)
        gcode.register_command("ADD_SEGMENT", self.segment_add, desc=ADD_SEGMENT_HELP)
        gcode.register_command("EXECUTE_PROGRAM", self.program_execute, desc=PROGRAM_EXECUTE_HELP)
        gcode.register_command("CANCEL_PROGRAM", self.program_cancel, desc=PROGRAM_CANCEL_HELP)

        self.printer.register_event_handler("klippy:ready", self._klipper_ready)
        self.printer.register_event_handler("klippy:shutdown", self._klipper_shutdown)

    def _klipper_ready(self):
        self.timer = self.reactor.register_timer(self._step_timer)

    def _klipper_shutdown(self):
        self.heater.set_temp(0.)
        self.reactor.unregister_timer(self.timer)

    def _step_timer(self, eventtime):
        if not self._running or self.program.is_done():
            if self._running: # Program just finished
                final_temp = self.program.get_last_target()
                self.pheaters.set_temperature(self.heater, final_temp)
                self.program_cancel() # Stop the timer and reset state
            return self.reactor.NEVER

        temp = self.program.get_step(eventtime)
        if temp != self._prev_target:
            self.pheaters.set_temperature(self.heater, temp)
            self._prev_target = temp

        return eventtime + 1

    def program_clear(self, gcmd=None):
        """Clears the current program from memory."""
        self.program_cancel()
        self.program = Program()
        if gcmd:
            gcmd.respond_info("Oven program cleared.")

    def segment_add(self, gcmd):
        """Adds a segment to the program."""
        temp = gcmd.get_float("TEMP")
        ramp_time = gcmd.get_int("RAMP_TIME")
        hold_time = gcmd.get_int("HOLD_TIME", 0)
        
        self.program.add_segment(temp, ramp_time, hold_time)
        if gcmd:
            gcmd.respond_info(f"Segment added: Temp={temp}, Ramp={ramp_time}s, Hold={hold_time}s")

    def program_execute(self, gcmd=None):
        """Executes the loaded program."""
        if self.program.is_empty():
            raise CommandError("No program to execute. Use PROGRAM_CLEAR and ADD_SEGMENT first.")
        
        self._running = True
        self.program.start(self.reactor.monotonic())
        self.reactor.update_timer(self.timer, self.reactor.monotonic())
        if gcmd:
            gcmd.respond_info("Executing oven program...")

    def program_cancel(self, gcmd=None):
        """Stops the currently running program."""
        self._running = False
        self._prev_target = 0.
        self.reactor.update_timer(self.timer, self.reactor.NEVER)
        # Optionally, you can turn off the heater on cancel
        # self.pheaters.set_temperature(self.heater, 0)
        if gcmd:
            gcmd.respond_info("Oven program cancelled.")

    def get_status(self, eventtime):
        status = self.heater.get_status(eventtime)
        if self._running:
            status.update({"segment_target" : self.program.get_current_target()})
        return status

def load_config(config):
    return PizzaOven(config)
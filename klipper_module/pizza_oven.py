# klipper_module/pizza_oven.py
import logging
import pathlib
import math
from gcode import CommandError

# Help texts for G-code commands
PROGRAM_CANCEL_HELP = "Cancel execution of the current program"
PROGRAM_CLEAR_HELP = "Clear the current program from memory"
ADD_SEGMENT_HELP = "Add a program segment: TEMP, RAMP_TIME (sec), HOLD_TIME (sec)"
EXECUTE_PROGRAM_HELP = "Execute the program. Add WAIT=1 to pause G-code processing until the program finishes."

# Constants
TEMP_RANGE_TOLERANCE = 2 # Degrees C
AMBIENT_TEMP = 25 # Degrees C

# Ramp mode constants
NONE                = 0x00
LINEAR              = 0x01

def in_range(value, target, tolerance=0):
    """Checks if a value is within a target's tolerance."""
    return (value >= target - tolerance) and (value <= target - tolerance)

def calc_temp_ramp(mode, k):
    """Calculates the ramp progress. Currently only supports linear."""
    if k <= 0: return 0
    if k >= 1: return 1
    return k

class ProgramSegment:
    def __init__(self, target, duration, method, start_temp=AMBIENT_TEMP):
        self.target = target
        self.duration = duration
        self.method = method
        self.start_temp = start_temp
        self._start_time = 0

    def start(self, eventtime):
        """Starts the timer for this segment."""
        self._start_time = eventtime

    def runtime(self, eventtime):
        """Returns the elapsed time for this segment."""
        if self._start_time == 0:
            return 0
        return round(eventtime - self._start_time)

    def is_done(self, eventtime):
        """Checks if the segment's duration has elapsed."""
        if self.duration == 0:
            return True
        return self.runtime(eventtime) >= self.duration

class Program:
    def __init__(self):
        self._segments = []
        self._iter = 0
        self._prev_temp = AMBIENT_TEMP

    def add_segment(self, target, ramp_time, hold_time):
        """Adds ramp and hold segments to the program."""
        # Ramp segment
        self._segments.append(ProgramSegment(target, ramp_time, LINEAR, self._prev_temp))
        # Hold segment
        if hold_time > 0:
            self._segments.append(ProgramSegment(target, hold_time, NONE, target))
        self._prev_temp = target

    def is_empty(self):
        return len(self._segments) == 0

    def is_done(self):
        return self._iter >= len(self._segments)

    def start(self, eventtime):
        """Starts the first segment of the program."""
        self._iter = 0
        if not self.is_done():
            self._segments[self._iter].start(eventtime)

    def get_current_segment(self):
        """Returns the currently active program segment."""
        if not self.is_done():
            return self._segments[self._iter]
        return None

    def advance(self, eventtime):
        """Moves to the next segment."""
        if self.is_done():
            return
        self._iter += 1
        if not self.is_done():
            self._segments[self._iter].start(eventtime)

    def get_target_temp_for_step(self, eventtime):
        """Calculates the theoretical temperature for the current time in the ramp."""
        if self.is_done():
            return self.get_last_target()

        step = self.get_current_segment()
        if step.method == NONE:
            return step.target

        # Calculate progress ratio 'k' for the ramp
        k = step.runtime(eventtime) / step.duration if step.duration > 0 else 1.0
        
        temp_diff = step.target - step.start_temp
        return step.start_temp + temp_diff * calc_temp_ramp(step.method, k)
    
    def get_last_target(self):
        """Returns the target temperature of the very last segment."""
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
        
        self._state = "IDLE" # Can be IDLE, RAMPING, WAITING, HOLDING
        self._wait_gcmd = None # For storing the G-code command we are waiting on

        # Register G-code commands
        gcode.register_command("PROGRAM_CLEAR", self.program_clear, desc=PROGRAM_CLEAR_HELP)
        gcode.register_command("ADD_SEGMENT", self.segment_add, desc=ADD_SEGMENT_HELP)
        gcode.register_command("EXECUTE_PROGRAM", self.program_execute, desc=EXECUTE_PROGRAM_HELP)
        gcode.register_command("CANCEL_PROGRAM", self.program_cancel, desc=PROGRAM_CANCEL_HELP)

        self.printer.register_event_handler("klippy:ready", self._klipper_ready)

    def _klipper_ready(self):
        self.timer = self.reactor.register_timer(self._tick)

    def _tick(self, eventtime):
        """Main logic tick, runs every second during program execution."""
        if self._state == "IDLE":
            return self.reactor.NEVER

        if self.program.is_done():
            self.program_cancel(reason="Program finished.")
            return self.reactor.NEVER
        
        segment = self.program.get_current_segment()
        current_temp, _ = self.heater.get_temp(eventtime)

        # --- STATE MACHINE LOGIC ---
        
        if self._state == "RAMPING":
            if segment.is_done(eventtime):
                # Ramp time is over, now wait for temperature to be reached
                self._state = "WAITING"
            else:
                temp = self.program.get_target_temp_for_step(eventtime)
                if temp != self._prev_target:
                    self.pheaters.set_temperature(self.heater, temp)
                    self._prev_target = temp

        elif self._state == "WAITING":
            # Set heater to the final target of the segment
            self.pheaters.set_temperature(self.heater, segment.target)
            # Check if we have reached the target temperature
            if in_range(current_temp, segment.target, TEMP_RANGE_TOLERANCE):
                self.program.advance(eventtime)
                # Check the new segment to decide the next state
                new_segment = self.program.get_current_segment()
                if new_segment is None: # Program ended
                    self.program_cancel(reason="Program finished.")
                    return self.reactor.NEVER
                elif new_segment.method == NONE:
                    self._state = "HOLDING"
                else: # Next segment is another ramp
                    self._state = "RAMPING"

        elif self._state == "HOLDING":
            # Maintain target temperature
            self.pheaters.set_temperature(self.heater, segment.target)
            if segment.is_done(eventtime):
                # Hold time is over, advance to the next segment (which should be a ramp)
                self.program.advance(eventtime)
                self._state = "RAMPING"

        return eventtime + 1

    def program_clear(self, gcmd=None):
        self.program_cancel()
        self.program = Program()
        if gcmd:
            gcmd.respond_info("Oven program cleared.")

    def segment_add(self, gcmd):
        temp = gcmd.get_float("TEMP")
        ramp_time = gcmd.get_int("RAMP_TIME")
        hold_time = gcmd.get_int("HOLD_TIME", 0)
        self.program.add_segment(temp, ramp_time, hold_time)
        if gcmd:
            gcmd.respond_info(f"Segment added: Temp={temp}, Ramp={ramp_time}s, Hold={hold_time}s")

    def program_execute(self, gcmd):
        """Executes the loaded program."""
        if self.program.is_empty():
            raise CommandError("No program to execute. Use ADD_SEGMENT first.")
        
        # Check if we should wait for completion
        wait = gcmd.get_int('WAIT', 0, minval=0, maxval=1)

        now = self.reactor.monotonic()
        self.program.start(now)
        
        first_segment = self.program.get_current_segment()
        if first_segment.method == NONE:
            self._state = "HOLDING"
        else:
            self._state = "RAMPING"

        self.reactor.update_timer(self.timer, now)
        gcmd.respond_info("Executing oven program...")

        # If WAIT=1, pause G-code processing
        if wait:
            self._wait_gcmd = gcmd
            self.reactor.pause(gcmd.pause())

    def program_cancel(self, gcmd=None, reason="Oven program cancelled."):
        """Stops the currently running program."""
        self._state = "IDLE"
        self._prev_target = 0.
        self.reactor.update_timer(self.timer, self.reactor.NEVER)
        
        # If a G-code command was waiting, resume it
        if self._wait_gcmd:
            self._wait_gcmd.resume()
            self._wait_gcmd = None

        if gcmd:
            gcmd.respond_info(reason)
        # If the program finished on its own, log it to the console
        elif "finished" in reason:
            self.printer.lookup_object('gcode').respond_info(reason)

    def get_status(self, eventtime):
        status = self.heater.get_status(eventtime)
        status['program_state'] = self._state
        if self._state != 'IDLE' and not self.program.is_done():
            status['segment_target'] = self.program.get_current_segment().target
        return status

def load_config(config):
    return PizzaOven(config)
import logging
import pathlib
import math
from gcode import CommandError

CALIBRATE_OVEN_HELP = "Calibrate heat/cool rate of the oven"
PROGRAM_LOAD_HELP = "Load a saved program from disk"
PROGRAM_SAVE_HELP = "Save the current program to disk"
PROGRAM_EXECUTE_HELP = "Execute the current program"
PROGRAM_CANCEL_HELP = "Cancel execution of the current program"
PROGRAM_CLEAR_HELP = "Clear the current program"
ADD_SEGMENT_HELP = "Add a program segment"

TEMP_RANGE_TOLERANCE = 2 # Degrees C
AMBIENT_TEMP = 25 # Degrees C

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
    if k == 0 or k == 1:
        return k
    if mode == QUADRATIC_IN:
        return powin(k,2)
    if mode == QUADRATIC_OUT:
        return powout(k,2)
    if mode == QUADRATIC_INOUT:
        return powinout(k,2)
    if mode == CUBIC_IN:
        return powin(k,3)
    if mode == CUBIC_OUT:
        return powout(k,3)
    if mode == CUBIC_INOUT:
        return powinout(k,3)
    if mode == QUARTIC_IN:
        return powin(k,4)
    if mode == QUARTIC_OUT:
        return powout(k,4)
    if mode == QUARTIC_INOUT:
        return powinout(k,4)
    if mode == QUINTIC_IN:
        return powin(k,5)
    if mode == QUINTIC_OUT:
        return powout(k,5)
    if mode == QUINTIC_INOUT:
        return powinout(k,5)
    if mode == SINUSOIDAL_IN:
        return 1-math.cos(k*(math.pi/2))
    if mode == SINUSOIDAL_OUT:
        return math.sin(k*(math.pi/2))
    if mode == SINUSOIDAL_INOUT:
        return -0.5*(math.cos(math.pi*k)-1)
    return k

class ProgramSegment:
    def __init__(self, target, duration, method):
        self.target = target
        self.duration = duration
        if isinstance(method, int):
            if method < NONE or method > SINUSOIDAL_INOUT:
                raise ValueError("Invalid method value")
        else:
            try:
                method = eval(f"{method.upper()}")
            except ValueError:
                raise ValueError("Invalid method name")
        self.method = method
        self.position = 0
        self._start_time = 0

    def start(self, eventtime):
        self._start_time = eventtime

    def runtime(self, eventtime):
        return round(eventtime - self._start_time)

    def is_done(self, eventtime):
        return self.runtime(eventtime) == self.duration

class Program:
    def __init__(self):
        self._segments = []
        self._iter = 0
        self._prev_time = 0
        self._prev_temp = AMBIENT_TEMP

    def add_segment(self,  target, ramp_time, ramp_method, hold_time):
        segment = ProgramSegment(target, ramp_time, ramp_method)
        self._segments.append(segment)
        if hold_time:
            self._segments.append(ProgramSegment(target, hold_time, "NONE"))

    def is_empty(self):
        return len(self._segments) == 0

    def is_done(self):
        return self._iter == len(self._segments)

    def start(self, eventtime):
        self._prev_time = eventtime
        self._segments[self._iter].start(eventtime)

    def reset(self):
        self._iter = 0

    def _ramp(self, start_temp, step, delta):
        if step.method == NONE:
            return step.target
        if step.position + delta < step.duration:
            step.position += delta
        else:
            step.position = step.duration
        k = step.position / step.duration
        if step.target >= start_temp:
            val = (start_temp + (step.target - start_temp) * calc_temp_ramp(step.method, k))
        else:
            return step.target
        return val

    def get_step(self, eventtime):
        step = self._segments[self._iter]
        if step.is_done(eventtime):
            self._iter += 1
            if self.is_done():
                return 0
            
            self._prev_temp = step.target
            step = self._segments[self._iter]
            step.start(eventtime)
        
        dt = eventtime - self._prev_time
        self._prev_time = eventtime
        return self._ramp(self._prev_temp, step, dt)
    
    def get_current_target(self):
        if not self.is_done():
            return self._segments[self._iter].target
        return 0

    def get_last_target(self):
        if not self._segments:
            return 0
        return self._segments[-1].target
    
    def __iter__(self):
        i = 0
        while i < len(self._segments):
            segment = self._segments[i]
            seg_spec = [segment.target, segment.duration, 0, segment.method]
            if i + 1 < len(self._segments) and self._segments[i+1].method == NONE and \
                seg_spec[0] == self._segments[i+1].target:
                i += 1
                seg_spec[2] = self._segments[i].duration
            yield tuple(seg_spec)
            i += 1


class PizzaOven:
    def __init__(self, config):
        self.printer = config.get_printer()
        self.reactor = self.printer.get_reactor()
        
        # Define the base path for profiles in the 'gcodes' directory
        config_dir_path = pathlib.Path(self.printer.get_start_args()["config_file"]).parent
        self.profiles_path = config_dir_path.parent / "gcodes"

        gcode = self.printer.lookup_object("gcode")
        self.pheaters = self.printer.load_object(config, "heaters")
        self.heater = self.pheaters.setup_heater(config)
        self.program = None
        self._prev_target = 0.
        self._prev_temp =  0.
        self._running = False
        self.heat_rate = config.getfloat("heat_rate", 0.)
        self.cool_rate = config.getfloat("cool_rate", 0.)

        gcode.register_command("CALIBRATE_OVEN", self.calibrate, False,
                               desc=CALIBRATE_OVEN_HELP)
        gcode.register_command("LOAD_PROGRAM", self.program_load, False,
                               desc=PROGRAM_LOAD_HELP)
        gcode.register_command("SAVE_PROGRAM", self.program_save, False,
                               desc=PROGRAM_SAVE_HELP)
        gcode.register_command("EXECUTE_PROGRAM", self.program_execute, False,
                               desc=PROGRAM_EXECUTE_HELP)
        gcode.register_command("CANCEL_PROGRAM", self.program_cancel, False,
                               desc=PROGRAM_CANCEL_HELP)
        gcode.register_command("CLEAR_PROGRAM", self.program_clear, False,
                               desc=PROGRAM_CLEAR_HELP)
        gcode.register_command("ADD_SEGMENT", self.segment_add, False,
                               desc=ADD_SEGMENT_HELP)
        self.printer.register_event_handler("klippy:ready",
                                            self._klipper_ready)
        self.printer.register_event_handler("klippy:shutdown",
                                            self._klipper_shutdown)

    def _klipper_ready(self):
        self.timer = self.reactor.register_timer(self._step_timer)

    def _klipper_shutdown(self):
        self.heater.set_temp(0.)
        self.reactor.unregister_timer(self.timer)

    def _step_timer(self, eventtime):
        current_temp, target_temp = self.heater.get_temp(eventtime)
        if self.program.is_done():
            self.pheaters.set_temperature(self.heater, 0.)
            return self.reactor.NEVER

        print(f"Current temp: {round(current_temp, 4)}, target temp: {round(target_temp, 4)}"
              f" eventtime: {eventtime}, prev target: {round(self._prev_target, 4)}, "
              f"diff: {round(self._prev_target - current_temp, 4)}, new target:", end=" ")
        if self._prev_target:
            if self.program.get_current_target() > self._prev_target and \
                not in_range(current_temp, self._prev_target, self.heat_rate):
                raise CommandError("Oven not heating at expected rate.")
            elif self.program.get_current_target() < self._prev_target and \
                not in_range(current_temp, self._prev_temp, self.cool_rate):
                raise CommandError("Oven not cooling at expected rate.")

        self._prev_temp = current_temp
        temp = self.program.get_step(eventtime)
        if temp != self._prev_target:
            self.pheaters.set_temperature(self.heater, temp)
            self._prev_target = temp

        return eventtime + 1

    def calibrate(self, gcmd):
        calibration_temp = gcmd.get_float("TEMP", self.heater.max_temp - 20)
        cool_wait = gcmd.get_int("COOL_RATE_TIME", 300)
        toolhead = self.printer.lookup_object("toolhead")
        heat_rate = 0.
        cool_rate = 0.

        start_temp = current_temp = list(map(int, self.heater.get_temp(0)))[0]
        start_time = eventtime = self.reactor.monotonic()
        self.pheaters.set_temperature(self.heater, calibration_temp)
        
        while current_temp <= calibration_temp and not self.printer.is_shutdown():
            print_time = toolhead.get_last_move_time()
            eventtime = self.reactor.pause(eventtime + 1.)
            current_temp, _ = self.heater.get_temp(eventtime)
        
        heat_rate = (round(current_temp) - round(start_temp)) / (eventtime - start_time)

        # Wait for a few seconds for the temperature to settle
        eventtime = self.reactor.pause(eventtime + 20.)

        # target would be a step higher than upper from the loop
        # below
        start_temp, _ = self.heater.get_temp(eventtime)
        self.pheaters.set_temperature(self.heater, 0.)
        start_time = eventtime = self.reactor.monotonic()
        while not self.printer.is_shutdown():
            print_time = toolhead.get_last_move_time()
            eventtime = self.reactor.pause(eventtime + 1.)
            if eventtime - start_time >= cool_wait:
                break

        end_temp, _ = self.heater.get_temp(eventtime)
        cool_rate = (round(start_temp) - round(end_temp)) / (eventtime - start_time)
            

        config = self.printer.lookup_object("configfile")
        config.set("pizza_oven", "heat_rate", heat_rate)
        config.set("pizza_oven", "cool_rate", cool_rate)

    def program_load(self, gcmd):
        name = gcmd.get("NAME")

        self.program = Program()

        program_path = self.profiles_path / ("pizza_" + name + ".cfg")
        if not program_path.exists():
            raise gcmd.error("Unknown program '%s'" % name)

        with open(program_path, 'r') as prgm:
            for seg_spec in prgm:
                try:
                    print(seg_spec, seg_spec.split(":"))
                    temp, time, hold, method = seg_spec.strip().split(":")
                    temp = float(temp)
                    time = int(time)
                    hold = int(hold)
                    method = int(method)
                except ValueError:
                    raise gcmd.error("Incorrect program segment format '%s'" % seg_spec)
                
                self.program.add_segment(temp, time, method, hold)

    def program_save(self, gcmd):
        name = gcmd.get("NAME")

        if not self.program:
            raise gcmd.error("There is no program currently loaded.")
        
        program_path = self.profiles_path / ("pizza_" + name + ".cfg")
        with open(program_path, "w") as prgm:
            for segment in self.program:
                prgm.write("%s:%s:%s:%s\n" % segment)

    def program_execute(self, gcmd):
        if not self.heat_rate or not self.cool_rate:
            raise gcmd.error("Oven is not calibrated. Run CALIBRATE_OVEN first.")

        if not self.program or self.program.is_empty():
            raise gcmd.error("Program is empty")

        self.program.reset()
        self.program.start(self.reactor.monotonic())
        self.reactor.update_timer(self.timer, self.reactor.monotonic() + 1)

    def program_cancel(self, gcmd):
        if self.program:
            self.reactor.update_timer(self.timer, self.reactor.NEVER)
        self.pheaters.set_temperature(self.heater, 0)

    def program_clear(self, gcmd):
        self.reactor.update_timer(self.timer, self.reactor.NEVER)
        self.program = None

    def segment_add(self, gcmd):
        temp = gcmd.get_float("TEMP")
        ramp_time = gcmd.get_int("RAMP_TIME")
        ramp_mode = gcmd.get("RAMP_MODE", "LINEAR")
        hold_time = gcmd.get_int("HOLD_TIME", 0)

        if not self.program:
            self.program = Program()

        prev_target = self.program.get_last_target()
        if self.heat_rate and temp > prev_target:
            if ramp_time * self.heat_rate < temp - prev_target:
                raise gcmd.error("Ramp rate too fast for heater's heat rate.")
        elif self.cool_rate:
            if ramp_time * self.cool_rate > prev_target - temp:
                raise gcmd.error("Cool rate too slow to meet ramp time.")

        try:
            self.program.add_segment(temp, ramp_time, ramp_mode, hold_time)
        except Exception as e:
            raise gcmd.error("Failed to add program section: %s" % str(e))

    def stats(self, eventtime):
        return self.heater.stats(eventtime)
    
    def get_status(self, eventtime):
        status = self.heater.get_status(eventtime)
        if self.program:
            status.update({"segment_target" : self.program.get_current_target(),
            })
        return status

def load_config(config):
    return PizzaOven(config)
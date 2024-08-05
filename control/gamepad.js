import { floor, angle } from "../tool/functions";
import { Vector2 } from "three";

// Xbox A Button
const ATTACK = 0;

// Xbox B Button
const JUMP = 1;

// Xbox X Button
const X_Button = 2;

// Xbox Y Button
const Y_Button = 3;

// Xbox Left Bumper
const Left_Bumper = 4;

// Xbox Right Bumper
const Right_Bumper = 5;

// Xbox Left Trigger Button
const Left_Trigge = 6;

// Xbox Right Trigger Button
const LOCK = 7;

// Xbox Select Button
const Select_Button = 8;

// Xbox Start Button
const StarT_Button = 9;

// Xbox Left Analog Button
const Left_Analog_Button = 10;

// Xbox Right Analog Button
const Right_Analog_Button = 11;

// Xbox Up D-pad
const Up_Dpad = 12;

// Xbox Down D-pad
const Down_Dpad = 13;

// Xbox Left D-pad
const Left_Dpad = 14;

// Xbox Right D-pad
const Right_Dpad = 15;

// Xbox Left Stick
const XL = 0;
const ZL = 1;

// Xbox Right Stick
const XR = 2;
const ZR = 3;

// Keyboard
const keys = {
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
    l: 'attack',
    m: 'jump',
    shift: 'lock'
}

export default class Gamepad {
    pressed = {};
    previousPressed = {};
    axis = new Vector2();
    constructor() {
        document.addEventListener("keydown", (e) => {
            this.pressed[keys[e.key.toLowerCase()]] = true;
        });

        document.addEventListener("keyup", (e) => {
            this.previousPressed[keys[e.key.toLowerCase()]] = true;
            this.pressed[keys[e.key.toLowerCase()]] = false;
        });
    }

    updateAxis() {
        const pressed = this.pressed
        if (pressed.up && !pressed.down) {
            this.axis.y = -1
        } else if (!pressed.up && pressed.down) {
            this.axis.y = 1
        } else {
            this.axis.y = 0
        }
        if (pressed.left && !pressed.right) {
            this.axis.x = -1
        } else if (!pressed.left && pressed.right) {
            this.axis.x = 1
        } else {
            this.axis.x = 0
        }
        this.axis.normalize();
    }


    get gamepad() {
        return navigator.getGamepads()[0];
    }

    get x() {
        if (!this.gamepad) {
            this.updateAxis();
            return this.axis.x;
        };
        return floor(this.gamepad.axes[XL]);
    }

    get z() {
        if (!this.gamepad) {
            this.updateAxis();
            return this.axis.y;
        };
        return floor(this.gamepad.axes[ZL]);
    }

    get attack() {
        if (!this.gamepad) {
            if (this.pressed.attack) {
                return true;
            } else {
                return false;
            } 
        }
        return this.gamepad.buttons[ATTACK].pressed;
    }

    get jump() {
        if (!this.gamepad) {
            if (this.pressed.jump) {
                console.log("Jump");
                return true;
            } else {
                console.log("Grond");
                return false;
            } 
        }
        return this.gamepad.buttons[JUMP].pressed;
    }

    get lock() {
        if (!this.gamepad) {
            if (this.pressed.lock) {
                return true;
            } else {
                return false;
            } 
        }
        return this.gamepad.buttons[LOCK].pressed;
    }

    get angle() {
        return angle(this.x, this.z)
    }

    get moving() {
        return Math.abs(this.x) || Math.abs(this.z)
    }

}
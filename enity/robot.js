import { Object3D, Vector3 } from "three";
import { createRigidBodyEntity, range } from "../tool/functions";
import Sound from "../engine/sound";
import Gamepad from "../control/gamepad";
import Animator from "../engine/animator";

// const ATTACK = 'Punch';
const IDLE = 'Robot_Idle';
// const RUN = 'Running';
// const JUMP = "Jump";

export default class Robot extends Object3D {
    rigidBody = null;
    collider = null;
    animator = null;
    ground = null;
    ctrl = new Gamepad();
    sound = new Sound();

    constructor(mesh, physics) {
        super();
        const origin = new Vector3(2, .1, 0);
        this.animator = new Animator(mesh);
        this.initPhysic(physics, origin);
        this.initVisual(mesh);
        this.initAnimations();
    }

    initPhysic(physics, origin) {
        const { rigidBody, collider } = createRigidBodyEntity(origin, physics);
        this.rigidBody = rigidBody;
        this.collider = collider;
    }

    initVisual(mesh) {
        // console.log(mesh)
        this.add(mesh);
    }

    initAnimations() {
        // this.animator.load(ATTACK, 0.3);
        this.animator.load(IDLE, 3);
        // this.animator.load(RUN, 0.9);
        // this.animator.load(JUMP, 0.7);
    }

    update(dt) {
        this.updatePhysic();
        this.updateVisual(dt);
        this.updateAnimation(dt)
    }

    updatePhysic() {
        const x = 0;
        const z = 0;
        const y = this.rigidBody.linvel().y;
        this.rigidBody.setLinvel({ x, y, z }, true);
    }

    updateAnimation(dt) {
        this.animator.play(IDLE);
        this.animator.update(dt);
    }

    updateVisual(dt) {

        this.position.copy(this.rigidBody.translation());
        // if (this.ctrl.moving) {
        //     this.rotation.y += range(-this.ctrl.angle, this.rotation.y) * dt * 10;
        // }
    }
}
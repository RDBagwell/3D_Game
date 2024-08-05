import { Object3D, Vector3 } from "three";
import { createRigidBodyEntity, range } from "../tool/functions";
import Sound from "../engine/sound";
import Gamepad from "../control/gamepad";
import Animator from "../engine/animator";

const SPEED = 3;
const ATTACK = 'attack1';
const IDLE = 'idle';
const RUN = 'run';
const JUMP = "jump";
const SHIELD = "idle_shield";
const GRASS = 'grass'

const YELL = './sound/attack[1-4].wav';
const GRASS_R = './sound/step_grass[1-2].wav';
const GRASS_L = './sound/step_grass[3-4].wav';
const STONE_R = './sound/step_stone[1-2].wav';
const STONE_L = './sound/step_stone[3-4].wav';
const WOOD_R = './sound/step_wood1.wav';
const WOOD_L = './sound/step_wood2.wav';
const DIRT_R = './sound/step_dirt[1-2].wav';
const DIRT_L = './sound/step_dirt[3-4].wav';
const WARD = './sound/shield.wav';

export default class Player extends Object3D {
    rigidBody = null;
    collider = null;
    animator = null;
    ground = null;
    ctrl = new Gamepad();
    sound = new Sound();

    constructor(mesh, physics) {
        super();
        const origin = new Vector3(0, 0.1, 0);
        this.animator = new Animator(mesh);
        this.initPhysic(physics, origin);
        this.initVisual(mesh);
        this.initAnimations();
        this.initSound();
        this.syncAimSound();
    }

    initPhysic(physics, origin) {
        const { rigidBody, collider } = createRigidBodyEntity(origin, physics);
        this.rigidBody = rigidBody;
        this.collider = collider;
    }

    initVisual(mesh) {
        this.add(mesh);
    }

    initAnimations() {
        this.animator.load(ATTACK, 0.3);
        this.animator.load(IDLE, 3);
        this.animator.load(RUN, 0.5);
        this.animator.load(SHIELD, 3);
        this.animator.load(JUMP, 0.5);
    }

    initSound() {
        this.sound.load(YELL);
        this.sound.load(GRASS_R);
        this.sound.load(GRASS_L);
        this.sound.load(STONE_R);
        this.sound.load(STONE_L);
        this.sound.load(WOOD_R);
        this.sound.load(WOOD_L);
        this.sound.load(DIRT_R);
        this.sound.load(DIRT_L);
        this.sound.load(WARD);
    }

    update(dt) {
        this.updatePhysic();
        this.updateVisual(dt);
        this.updateAnimation(dt);
    }

    updatePhysic() {
        const x = this.ctrl.x * SPEED;
        const z = this.ctrl.z * SPEED;
        const y = this.rigidBody.linvel().y;
        this.rigidBody.setLinvel({ x, y, z }, true);
    }

    updateVisual(dt) {
        this.position.copy(this.rigidBody.translation());
        if (this.ctrl.moving) {
            this.rotation.y += range(this.ctrl.angle, this.rotation.y) * dt * 10;
        }
    }
    updateAnimation(dt) {
        if (this.ctrl.lock) {
            this.animator.play(SHIELD);
        } else if (this.ctrl.attack) {
            this.animator.play(ATTACK);
        } else if (this.ctrl.moving) {
            this.animator.play(RUN);
        } else if (this.ctrl.jump) {
            this.animator.play(JUMP);
        } else {
            this.animator.play(IDLE);
        }
        this.animator.update(dt);
    }
    updateGround(areas) {
        this.ground = GRASS;
        for (let area of areas) {
            const type = area.in(this.position);
            if (type) {
                this.ground = type; break
            }
        }

        console.log(this.ground);
    }

    syncAimSound() {
        this.animator.on(SHIELD, 'start', () => {
            this.sound.play(WARD);
        });

        this.animator.on(ATTACK, 'half', () => {
            this.sound.play(YELL);
        });

        this.animator.on(RUN, 'loop', () => {
            this.sound.play(DIRT_R);
        });

        this.animator.on(RUN, 'half', () => {
            this.sound.play(DIRT_L);
        });
    }
}
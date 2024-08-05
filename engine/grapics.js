import { WebGLRenderer, Clock } from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { getCanvas } from '../tool/functions';

export default class Graphic extends WebGLRenderer {

    scene = null;
    clock = new Clock();
    camera = null;
    cbUpdate = null;
    cbLoop = null;
    
    constructor(scene, camera) {
        const canvas = getCanvas();
        super({ canvas });
        this.scene = scene;
        this.camera = camera;
        this.cbLoop = this.loop.bind(this);
        this.shadowMap.enabled = true;

        // Initialize OrbitControls
        // this.controls = new OrbitControls(this.camera, this.domElement);
        // this.controls.enableDamping = true;

        this.loop();
    }
    loop() {
        const dt = this.clock.getDelta();
        if (this.cbUpdate) this.cbUpdate(dt);

        // Update the controls
        // this.controls.update();

        this.render(this.scene, this.camera);
        requestAnimationFrame(this.cbLoop);
    }
    onUpdate(callback) {
        this.cbUpdate = callback;
    }
}
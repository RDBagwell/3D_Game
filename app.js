import { Scene } from "three";
import Camera from "./engine/camra";
import Light from "./engine/light";
import Graphic from "./engine/grapics";
import World from "./enity/world";
import Player from "./enity/player";
import Robot from "./enity/robot";
import { loadWorld, loadEntity } from "./tool/loader";
import physics from "./engine/physic";

const assetW = await loadWorld('./glb/world2.glb');
const assetP = await loadEntity('./glb/character.glb');
const assetR = await loadEntity('./glb/character2.glb');

console.log(assetW);

const scene = new Scene();
const camera = new Camera();
// const world = new World(assetW.visuals, assetW.colliders, physics);
const world = new World(assetW.visuals, assetW.colliders, physics, assetW.areas);
const player = new Player(assetP, physics);
const robot = new Robot(assetR, physics);
const light = new Light();

scene.add(world);
scene.add(light);
scene.add(player);
scene.add(robot);



// Game Loop
const graphic = new Graphic(scene, camera);
graphic.onUpdate(dt => {
  physics.step();
  player.update(dt, world.areas);
  robot.update(dt, world.areas);
  camera.update(player);
  light.update(player);
});
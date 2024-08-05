import Rapier from "@dimforge/rapier3d-compat";

const gravity = { x: 0, y: -9.81, z: 0 };
await Rapier.init();


export default new Rapier.World(gravity);
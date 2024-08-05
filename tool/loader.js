import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { browse } from "./functions";

const loaderGlb = new GLTFLoader();

export async function loadEntity(path) {
    const glb = await loaderGlb.loadAsync(path);
    const mesh = glb.scene.children[0];
    browse(mesh, m => m.castShadow = true);
    mesh.clips = glb.animations;
    return mesh;
}

export async function loadWorld(path) {
    const glb = await loaderGlb.loadAsync(path);
    const visuals = [];
    const colliders = [];
    const areas = [];

   
    for (const mesh of glb.scene.children) {
        const name = mesh.name;
        if (name.includes('area')) {
            areas.push(mesh);
        } else if (name.includes('collider')) {
            colliders.push(mesh);
        } else {
            visuals.push(mesh);
        }
    }

    return { visuals, colliders, areas };
}

// export default async function loadAssets(path) {
//     const glb = await loaderGlb.loadAsync(path);
//     const visuals = [];
//     const colliders = [];
//     const players = []
//     for (const mesh of glb.scene.children) {
//         const name = mesh.name;
//         if (name.includes('visual')) {
//             visuals.push(mesh);
//         } else if (name.includes('collider')) {
//             colliders.push(mesh);
//         } else if (name.includes('player')) {
//             players.push(mesh);
//         }
//     }
//     return { visuals, colliders, players };
// }
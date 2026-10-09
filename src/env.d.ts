/// <reference types="vite/client" />

/** The music files in public/music/ (vite.config.js). */
declare module 'virtual:music-tracks' {
  const tracks: string[];
  export default tracks;
}

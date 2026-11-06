// Where the map is centred for the viewer (their shared location, or Kulhudhuffushi). Tiny on
// purpose: the house search reads it without pulling in the road data (src/roadArea.ts sets it).

let spot: [number, number] | undefined
export const getViewerSpot = () => spot
export const setViewerSpot = (at: [number, number]) => {
  spot = at
}

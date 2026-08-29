/* eslint no-unused-vars: 'off' */
import { draw } from '@shared/utils/dock'

let canvas

const initCanvas = () => {
  if (canvas) {
    return canvas
  }
  return new OffscreenCanvas(256, 256)
}

const drawDock = async (payload) => {
  if (!canvas) {
    canvas = initCanvas()
  }

  try {
    const dock = await draw({
      canvas,
      ...payload
    })

    self.postMessage({
      type: 'dock:drawed',
      payload: { dock }
    })
  } catch (error) {
    self.postMessage({
      type: 'log',
      payload: error.message
    })
  }
}

self.postMessage({
  type: 'initialized',
  payload: Date.now()
})

self.addEventListener('message', (event) => {
  const { type, payload } = event.data
  switch (type) {
  case 'dock:draw':
    drawDock(payload)
    break
  default:
    break
  }
})

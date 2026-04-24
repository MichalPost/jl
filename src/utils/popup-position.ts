const POPUP_OFFSET_Y = 12
const POPUP_MARGIN = 16

export interface PopupPositionInput {
  mouseX: number
  mouseY: number
  screenWidth: number
  screenHeight: number
  popupWidth: number
  popupHeight: number
}

export interface PopupPosition {
  x: number
  y: number
}

export function calculatePopupPosition({
  mouseX,
  mouseY,
  screenWidth,
  screenHeight,
  popupWidth,
  popupHeight,
}: PopupPositionInput): PopupPosition {
  const maxX = Math.max(POPUP_MARGIN, screenWidth - popupWidth - POPUP_MARGIN)
  const maxY = Math.max(POPUP_MARGIN, screenHeight - popupHeight - POPUP_MARGIN)

  let x = mouseX
  let y = mouseY + POPUP_OFFSET_Y

  if (x + popupWidth > screenWidth - POPUP_MARGIN) {
    x = maxX
  }

  if (y + popupHeight > screenHeight - POPUP_MARGIN) {
    y = Math.max(POPUP_MARGIN, mouseY - popupHeight - POPUP_OFFSET_Y)
  }

  return {
    x: Math.min(Math.max(POPUP_MARGIN, x), maxX),
    y: Math.min(Math.max(POPUP_MARGIN, y), maxY),
  }
}

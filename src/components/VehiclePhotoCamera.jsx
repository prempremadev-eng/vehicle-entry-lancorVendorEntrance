import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.8

function frameToBlob(video, canvas) {
  const largestSide = Math.max(video.videoWidth, video.videoHeight)
  const scale = largestSide > MAX_DIMENSION ? MAX_DIMENSION / largestSide : 1
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
}

function VehiclePhotoCamera({ onCaptured, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  // Set while our own history entry is still on the stack, so a Cancel/Capture
  // tap can pop it — the phone's back button pops it itself.
  const hasHistoryEntryRef = useRef(false)
  // Kept in a ref so a parent re-render passing a new onClose doesn't re-run
  // the history effect below (which would push a second entry).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const [status, setStatus] = useState('starting') // starting | ready | error
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setErrorMessage('Camera is not supported in this browser.')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setStatus('ready')
      } catch {
        if (!cancelled) {
          setStatus('error')
          setErrorMessage('Camera access denied. Please allow camera permission and try again.')
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Lets the phone's back button close the camera instead of leaving the page.
  useEffect(() => {
    window.history.pushState({ vehiclePhotoCamera: true }, '')
    hasHistoryEntryRef.current = true

    const handlePopState = () => {
      hasHistoryEntryRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (hasHistoryEntryRef.current) {
        hasHistoryEntryRef.current = false
        window.history.back()
      }
    }
  }, [])

  const handleCapture = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return

    const blob = await frameToBlob(video, canvas)
    if (!blob) {
      setErrorMessage('Could not capture the photo. Try again.')
      return
    }
    onCaptured(new File([blob], 'vehicle.jpg', { type: 'image/jpeg' }))
    onClose()
  }

  return (
    <div className="scanner-overlay" role="dialog" aria-modal="true">
      <div className="scanner-panel">
        <h3 className="scanner-title">Take Vehicle Photo</h3>

        <div className="scanner-viewport">
          <video ref={videoRef} className="scanner-video" autoPlay playsInline muted />
          <canvas ref={canvasRef} hidden />
        </div>

        {status === 'starting' && <p className="scanner-status">Starting camera…</p>}
        {errorMessage && <p className="form-error">{errorMessage}</p>}

        <div className="scanner-actions">
          <button type="button" className="btn-primary" onClick={handleCapture} disabled={status !== 'ready'}>
            Capture
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

VehiclePhotoCamera.propTypes = {
  onCaptured: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}

export default VehiclePhotoCamera

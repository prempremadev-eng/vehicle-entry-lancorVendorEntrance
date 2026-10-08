import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { PLATE_SCAN_FUNCTION_URL } from '../constants'

// Keeps the upload small and fast on a mobile gate connection while staying
// well under Plate Recognizer's 3 MB cloud API limit.
const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.8

function compressFrame(sourceCanvas) {
  return new Promise((resolve) => {
    let canvas = sourceCanvas
    const largestSide = Math.max(sourceCanvas.width, sourceCanvas.height)

    if (largestSide > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / largestSide
      const resized = document.createElement('canvas')
      resized.width = Math.round(sourceCanvas.width * scale)
      resized.height = Math.round(sourceCanvas.height * scale)
      resized.getContext('2d').drawImage(sourceCanvas, 0, 0, resized.width, resized.height)
      canvas = resized
    }

    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY)
  })
}

function PlateRecognizerScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const [status, setStatus] = useState('starting') // starting | ready | scanning | error
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setErrorMessage('Camera is not supported in this browser. Enter the number manually.')
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
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setStatus('ready')
      } catch {
        if (!cancelled) {
          setStatus('error')
          setErrorMessage(
            'Camera access denied. Please allow camera permission or enter the number manually.'
          )
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const handleCapture = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)

    setStatus('scanning')
    setErrorMessage('')

    try {
      const blob = await compressFrame(canvas)
      const formData = new FormData()
      formData.append('upload', blob, 'plate.jpg')

      const response = await fetch(PLATE_SCAN_FUNCTION_URL, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        setStatus('ready')
        setErrorMessage('Scan failed. Try again or enter the number manually.')
        return
      }

      const data = await response.json()

      if (!data.vehicleNumber) {
        setStatus('ready')
        setErrorMessage('No plate detected. Try again or enter it manually.')
        return
      }

      onDetected(data.vehicleNumber)
      onClose()
    } catch {
      setStatus('ready')
      setErrorMessage('Scan failed. Try again or enter the number manually.')
    }
  }

  return (
    <div className="scanner-overlay" role="dialog" aria-modal="true">
      <div className="scanner-panel">
        <h3 className="scanner-title">Scan Vehicle Number</h3>

        <div className="scanner-viewport">
          <video ref={videoRef} className="scanner-video" autoPlay playsInline muted />
          <canvas ref={canvasRef} hidden />
        </div>

        {status === 'starting' && <p className="scanner-status">Starting camera…</p>}
        {status === 'scanning' && <p className="scanner-status">Scanning plate…</p>}
        {errorMessage && <p className="form-error">{errorMessage}</p>}

        <div className="scanner-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleCapture}
            disabled={status !== 'ready'}
          >
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

PlateRecognizerScanner.propTypes = {
  onDetected: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}

export default PlateRecognizerScanner

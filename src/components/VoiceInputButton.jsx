import PropTypes from 'prop-types'

function VoiceInputButton({ field, isSupported, isListening, onStart, onStop }) {
  if (!isSupported) return null

  return (
    <button
      type="button"
      className={`voice-btn${isListening ? ' voice-btn-listening' : ''}`}
      onClick={() => (isListening ? onStop() : onStart(field))}
      aria-label={isListening ? `Stop voice input for ${field}` : `Speak to fill ${field}`}
      title={isListening ? 'Tap to stop' : 'Tap to speak'}
    >
      🎤
    </button>
  )
}

VoiceInputButton.propTypes = {
  field: PropTypes.string.isRequired,
  isSupported: PropTypes.bool.isRequired,
  isListening: PropTypes.bool.isRequired,
  onStart: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
}

export default VoiceInputButton

export const MAX_BIO_LENGTH = 160
export const MAX_DISPLAY_NAME_LENGTH = 120
export const availabilityOptions = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'away', label: 'Away' },
]

export const availabilityLabel = value =>
  availabilityOptions.find(option => option.value === value)?.label ?? 'Available'

export const contactProfile = (user, isOnline) => ({
  name: user?.name || user?.userName || '',
  username: user?.userName || '',
  bio: user?.bio || '',
  availability: availabilityLabel(user?.availability),
  presence: isOnline ? 'Active now' : 'Offline',
})

export const profileFields = user => ({
  name: user?.name ?? '',
  bio: user?.bio ?? '',
  availability: user?.availability ?? 'available',
})

export const initialProfileEditor = user => ({ fields: profileFields(user), error: '', success: '' })

export const profileEditorReducer = (state, action) => {
  switch (action.type) {
    case 'change': return { ...state, fields: { ...state.fields, [action.key]: action.value }, error: '', success: '' }
    case 'error': return { ...state, error: action.message, success: '' }
    case 'saved': return { fields: profileFields(action.user), error: '', success: 'Profile saved.' }
    case 'clearFeedback': return { ...state, error: '', success: '' }
    default: return state
  }
}

export const validateProfile = ({ name, bio, availability }, originalName = '') => {
  if (typeof name !== 'string' || !name.trim() ||
      (name !== originalName && name.trim().length > MAX_DISPLAY_NAME_LENGTH)) {
    return `Display name must be 1-${MAX_DISPLAY_NAME_LENGTH} characters.`
  }
  if (typeof bio !== 'string' || bio.trim().length > MAX_BIO_LENGTH) {
    return `Bio must be at most ${MAX_BIO_LENGTH} characters.`
  }
  if (!availabilityOptions.some(option => option.value === availability)) {
    return 'Choose a valid availability.'
  }
  return ''
}

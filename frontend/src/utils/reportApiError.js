export const reportApiError = error => {
  if (error?.response?.status !== 401) console.error(error)
}

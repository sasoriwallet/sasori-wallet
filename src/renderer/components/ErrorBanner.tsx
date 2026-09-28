export interface PageError {
  message: string
  technicalDetail?: string
}

export function ErrorBanner({ message, technicalDetail }: PageError) {
  return (
    <div className="banner banner--error">
      <div>{message}</div>
      {technicalDetail && (
        <details className="error-detail">
          <summary>Technical details</summary>
          <code>{technicalDetail}</code>
        </details>
      )}
    </div>
  )
}

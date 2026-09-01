import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { useOpenAiLogs } from '../hooks/useOpenAi'
import type { OpenAiRequestLog } from '../types'
import { formatDateTime, formatMicroCurrency } from '../utils/format'

export function SettingsOpenAiPage() {
  const { data: logs, isLoading, error } = useOpenAiLogs()
  const [viewingLog, setViewingLog] = useState<OpenAiRequestLog | null>(null)

  const totalCostUsd = useMemo(() => (logs ?? []).reduce((sum, log) => sum + log.costUsd, 0), [logs])

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>AI Requests</h2>
          <p className="page-header__meta">
            Every call to OpenAI for invoice image parsing, with its response and estimated cost. Local
            experimentation only - see VITE_OPENAI_API_KEY in your .env file.
          </p>
        </div>
      </div>

      {error && <p className="notice notice--error">Could not load the OpenAI request log.</p>}

      {!!logs?.length && (
        <p className="page-header__meta">
          {logs.length} request{logs.length === 1 ? '' : 's'} logged - {formatMicroCurrency(totalCostUsd)} total.
        </p>
      )}

      <div className="card">
        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && logs?.length === 0 && (
          <p className="empty-state">No requests yet. Upload a photo/scan invoice to send it to OpenAI.</p>
        )}
        {!!logs?.length && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>File</th>
                <th>Time</th>
                <th>Status</th>
                <th className="numeric">Tokens</th>
                <th className="numeric">Cost</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="data-table__row--clickable" onClick={() => setViewingLog(log)}>
                  <td>
                    <img src={log.imageDataUrl} alt="" className="openai-log-thumb" />
                  </td>
                  <td>{log.fileName}</td>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>
                    {log.error ? (
                      <span className="badge badge--error">Failed</span>
                    ) : (
                      <span className="badge badge--confirmed">Success</span>
                    )}
                  </td>
                  <td className="numeric">{log.usage?.totalTokens ?? '-'}</td>
                  <td className="numeric">{formatMicroCurrency(log.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {viewingLog && (
        <Modal title={viewingLog.fileName} size="large" onClose={() => setViewingLog(null)}>
          <div className="two-col">
            <div>
              <h2>Image sent</h2>
              <img src={viewingLog.imageDataUrl} alt={viewingLog.fileName} className="invoice-doc-preview" />
            </div>
            <div>
              <h2>{viewingLog.error ? 'Error' : 'Response JSON'}</h2>
              {viewingLog.error ? (
                <p className="notice notice--error">{viewingLog.error}</p>
              ) : (
                <pre className="json-view">{JSON.stringify(viewingLog.responseJson, null, 2)}</pre>
              )}
              <p className="page-header__meta">
                {viewingLog.usage
                  ? `${viewingLog.usage.promptTokens} prompt + ${viewingLog.usage.completionTokens} completion tokens`
                  : 'No usage reported.'}{' '}
                - {formatMicroCurrency(viewingLog.costUsd)}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

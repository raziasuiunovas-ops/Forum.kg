'use client'

import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  StopCircle,
  SwitchCamera,
  TicketCheck,
  VideoOff,
  XCircle,
} from 'lucide-react'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './StaffScanner.module.css'

type StaffRole = 'SCANNER' | 'MANAGER' | 'SUPER_ADMIN'
type AccessState = 'checking' | 'ready' | 'signed-out' | 'forbidden' | 'error'
type CheckStatus = 'VALID' | 'ALREADY_USED' | 'INVALID' | 'UNPAID' | 'EXPIRED' | 'ERROR'
type FacingMode = 'environment' | 'user'

interface EventOption {
  id: string
  title?: Record<string, string>
  startTime: string
  endTime?: string | null
  location?: { name?: Record<string, string> }
}

interface TicketDetails {
  ticketNumber: string
  status: string
  participant: { firstName: string; lastName: string }
  category: { code: string; name: string }
  forum: { id: string; slug: string; title: string; startsAt: string }
}

interface CheckInResponse {
  success: true
  checkIn: { id: string; checkedInAt: string; method: string }
  ticket: TicketDetails
}

interface ApiErrorResponse {
  error?: { code?: string; message?: string }
}

interface ScanResult {
  status: CheckStatus
  message: string
  detail?: string
  ticket?: TicketDetails
  checkedInAt: string
  eventTitle: string
  ticketNumber?: string
}

interface CameraOption {
  deviceId: string
  label: string
}

interface DetectedBarcode {
  rawValue: string
  format: string
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

function eventTitle(event?: EventOption): string {
  return event?.title?.ru || event?.title?.ky || event?.title?.en || 'Мероприятие'
}

function formatEventDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Дата не указана'
  return new Intl.DateTimeFormat('ru-KG', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function classifyError(code?: string): CheckStatus {
  switch (code) {
    case 'TICKET_ALREADY_USED':
    case 'ALREADY_CHECKED_IN':
      return 'ALREADY_USED'
    case 'ORDER_NOT_PAID':
      return 'UNPAID'
    case 'TICKET_EXPIRED':
      return 'EXPIRED'
    case 'TICKET_NOT_FOUND':
    case 'INVALID_QR_FORMAT':
    case 'TICKET_CANCELLED':
    case 'WRONG_FORUM':
      return 'INVALID'
    default:
      return 'ERROR'
  }
}

function statusLabel(status: CheckStatus): string {
  switch (status) {
    case 'VALID': return 'VALID'
    case 'ALREADY_USED': return 'ALREADY USED'
    case 'INVALID': return 'INVALID'
    case 'UNPAID': return 'UNPAID'
    case 'EXPIRED': return 'EXPIRED'
    case 'ERROR': return 'ERROR'
  }
}

function statusTitle(status: CheckStatus): string {
  switch (status) {
    case 'VALID': return 'Билет действителен'
    case 'ALREADY_USED': return 'Билет уже использован'
    case 'INVALID': return 'Билет не прошёл проверку'
    case 'UNPAID': return 'Заказ не оплачен'
    case 'EXPIRED': return 'Срок действия билета истёк'
    case 'ERROR': return 'Не удалось проверить билет'
  }
}

function defaultStatusMessage(status: CheckStatus): string {
  switch (status) {
    case 'VALID': return 'Регистрация на мероприятие подтверждена.'
    case 'ALREADY_USED': return 'Этот билет уже регистрировали на входе.'
    case 'INVALID': return 'Проверьте QR-код и выбранное мероприятие.'
    case 'UNPAID': return 'Для неоплаченного заказа вход не разрешён.'
    case 'EXPIRED': return 'Билет больше нельзя использовать для входа.'
    case 'ERROR': return 'Проверьте подключение и повторите запрос.'
  }
}

function extractDisplayTicketNumber(qrData: string): string | undefined {
  const parts = qrData.split('|')
  return parts[0] === 'FORUM.KG' && parts[1] ? parts[1].slice(0, 50) : undefined
}

export default function StaffScanner() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const submitRef = useRef<(qrData: string) => Promise<void>>(async () => {})
  const requestInFlightRef = useRef(false)
  const cameraStartInFlightRef = useRef(false)

  const [accessState, setAccessState] = useState<AccessState>('checking')
  const [accessMessage, setAccessMessage] = useState('Проверяем доступ сотрудника…')
  const [staffName, setStaffName] = useState('')
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [events, setEvents] = useState<EventOption[]>([])
  const [eventsError, setEventsError] = useState('')
  const [selectedEventId, setSelectedEventId] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [cameraMessage, setCameraMessage] = useState('Камера выключена. Нажмите «Включить камеру», чтобы начать сканирование.')
  const [cameraError, setCameraError] = useState('')
  const [facingMode, setFacingMode] = useState<FacingMode>('environment')
  const [cameraOptions, setCameraOptions] = useState<CameraOption[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [manualPayload, setManualPayload] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [history, setHistory] = useState<ScanResult[]>([])

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId]
  )

  const filteredEvents = useMemo(() => {
    const query = eventSearch.trim().toLocaleLowerCase('ru')
    if (!query) return events
    return events.filter((event) => eventTitle(event).toLocaleLowerCase('ru').includes(query))
  }, [events, eventSearch])

  useEffect(() => {
    let active = true

    async function loadStaffAccess() {
      try {
        const sessionResponse = await fetch('/api/v1/auth/session', {
          credentials: 'same-origin',
          cache: 'no-store',
        })

        if (!active) return
        if (sessionResponse.status === 401) {
          setAccessState('signed-out')
          setAccessMessage('Войдите в аккаунт сотрудника, чтобы открыть сканер.')
          return
        }
        if (!sessionResponse.ok) throw new Error('Не удалось подтвердить сессию.')

        const session = await sessionResponse.json() as {
          user?: { firstName?: string | null; lastName?: string | null; role?: string }
        }
        const user = session.user
        if (!user || !['SCANNER', 'MANAGER', 'SUPER_ADMIN'].includes(user.role || '')) {
          setAccessState('forbidden')
          setAccessMessage('Доступ есть только у сотрудников с ролью SCANNER, MANAGER или SUPER_ADMIN.')
          return
        }

        setStaffRole(user.role as StaffRole)
        setStaffName([user.firstName, user.lastName].filter(Boolean).join(' '))

        const [csrfResponse, eventsResponse] = await Promise.all([
          fetch('/api/v1/auth/csrf-token', { credentials: 'same-origin', cache: 'no-store' }),
          fetch('/api/v1/events?page=1&limit=100', { credentials: 'same-origin', cache: 'no-store' }),
        ])
        if (!active) return

        if (csrfResponse.ok) {
          const csrf = await csrfResponse.json() as { csrfToken?: string }
          if (csrf.csrfToken) setCsrfToken(csrf.csrfToken)
        }

        if (eventsResponse.ok) {
          const eventResponse = await eventsResponse.json() as { events?: EventOption[] }
          const availableEvents = Array.isArray(eventResponse.events) ? eventResponse.events : []
          setEvents(availableEvents)
          if (availableEvents.length > 0) setSelectedEventId(availableEvents[0].id)
        } else {
          setEventsError('Не удалось загрузить список опубликованных мероприятий.')
        }

        setAccessState('ready')
        setAccessMessage('Сотрудник авторизован. Выберите мероприятие и проверьте билет.')
      } catch (error) {
        if (!active) return
        setAccessState('error')
        setAccessMessage(error instanceof Error ? error.message : 'Не удалось проверить доступ.')
      }
    }

    void loadStaffAccess()
    return () => { active = false }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }, [])

  const appendHistory = useCallback((entry: ScanResult) => {
    setResult(entry)
    setHistory((current) => [entry, ...current].slice(0, 8))
  }, [])

  const submitQrData = useCallback(async (qrData: string) => {
    if (requestInFlightRef.current) return
    if (!selectedEventId) {
      appendHistory({
        status: 'ERROR',
        message: 'Сначала выберите мероприятие.',
        checkedInAt: new Date().toISOString(),
        eventTitle: eventTitle(selectedEvent),
        ticketNumber: extractDisplayTicketNumber(qrData),
      })
      return
    }
    if (!csrfToken) {
      appendHistory({
        status: 'ERROR',
        message: 'Не удалось получить CSRF-токен. Обновите страницу и попробуйте снова.',
        checkedInAt: new Date().toISOString(),
        eventTitle: eventTitle(selectedEvent),
        ticketNumber: extractDisplayTicketNumber(qrData),
      })
      return
    }

    requestInFlightRef.current = true
    setChecking(true)
    setCameraError('')
    stopCamera()

    const checkedInAt = new Date().toISOString()
    const ticketNumber = extractDisplayTicketNumber(qrData)
    const currentEventTitle = eventTitle(selectedEvent)

    try {
      const response = await fetch('/api/v1/check-in/validate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ qrData, forumId: selectedEventId }),
      })

      const responseBody = await response.json().catch(() => null) as (CheckInResponse & ApiErrorResponse) | null
      if (response.ok && responseBody && 'success' in responseBody && responseBody.ticket) {
        const entry: ScanResult = {
          status: 'VALID',
          message: 'Регистрация на входе успешно подтверждена.',
          ticket: responseBody.ticket,
          checkedInAt: responseBody.checkIn?.checkedInAt || checkedInAt,
          eventTitle: responseBody.ticket.forum.title || currentEventTitle,
          ticketNumber: responseBody.ticket.ticketNumber,
        }
        appendHistory(entry)
        setManualPayload('')
        return
      }

      const errorBody = responseBody as ApiErrorResponse | null
      const code = errorBody?.error?.code
      const status = classifyError(code)
      const entry: ScanResult = {
        status,
        message: errorBody?.error?.message || defaultStatusMessage(status),
        checkedInAt,
        eventTitle: currentEventTitle,
        ticketNumber,
      }
      appendHistory(entry)

      if (response.status === 401 || (response.status === 403 && code === 'INSUFFICIENT_PERMISSIONS')) {
        setAccessState(response.status === 401 ? 'signed-out' : 'forbidden')
        setAccessMessage(response.status === 401
          ? 'Сессия сотрудника истекла. Войдите снова.'
          : 'Роль сотрудника больше не разрешает выполнять check-in.')
      }
    } catch {
      appendHistory({
        status: 'ERROR',
        message: 'Не удалось связаться с сервером. Проверьте интернет-соединение и повторите проверку.',
        checkedInAt,
        eventTitle: currentEventTitle,
        ticketNumber,
      })
    } finally {
      requestInFlightRef.current = false
      setChecking(false)
    }
  }, [appendHistory, csrfToken, selectedEvent, selectedEventId, stopCamera])

  useEffect(() => {
    submitRef.current = submitQrData
  }, [submitQrData])

  const startCamera = useCallback(async (options?: { facingMode?: FacingMode; deviceId?: string }) => {
    if (cameraStartInFlightRef.current) return
    setCameraError('')

    const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    if (!window.isSecureContext && !isLocalHost) {
      setCameraError('Браузер разрешает доступ к камере только через HTTPS. Откройте защищённую ссылку или используйте ручной ввод QR payload.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Этот браузер не поддерживает доступ к камере. Используйте ручной ввод QR payload.')
      return
    }

    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
    if (!Detector) {
      setCameraError('В этом браузере нет встроенного распознавания QR-кодов. Используйте браузер с поддержкой BarcodeDetector или ручной ввод полного QR payload.')
      return
    }

    cameraStartInFlightRef.current = true
    setCameraStarting(true)
    try {
      const supportedFormats = await Detector.getSupportedFormats?.()
      if (supportedFormats && !supportedFormats.includes('qr_code')) {
        setCameraError('Браузер не поддерживает распознавание QR-кодов. Используйте ручной ввод полного QR payload.')
        return
      }

      stopCamera()
      const nextFacingMode = options?.facingMode || facingMode
      const videoConstraints: MediaTrackConstraints = options?.deviceId
        ? { deviceId: { exact: options.deviceId } }
        : { facingMode: { ideal: nextFacingMode } }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...videoConstraints, width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      streamRef.current = stream
      detectorRef.current = new Detector({ formats: ['qr_code'] })
      setFacingMode(nextFacingMode)

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }

      const devices = await navigator.mediaDevices.enumerateDevices()
      const cameras = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Камера ${index + 1}` }))
      setCameraOptions(cameras)
      const activeDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId || options?.deviceId || ''
      setSelectedCameraId(activeDeviceId)
      setCameraActive(true)
      setCameraMessage('Наведите камеру на QR-код билета. Проверка выполняется на сервере.')
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setCameraError('Доступ к камере запрещён. Разрешите камеру в настройках браузера или используйте ручной ввод.')
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setCameraError('Не удалось найти подходящую камеру. Выберите другую камеру или используйте ручной ввод.')
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        setCameraError('Камера занята другим приложением или не отвечает. Закройте другие приложения камеры и повторите попытку.')
      } else {
        setCameraError('Не удалось запустить камеру. Проверьте разрешения браузера и попробуйте снова.')
      }
      stopCamera()
    } finally {
      cameraStartInFlightRef.current = false
      setCameraStarting(false)
    }
  }, [facingMode, stopCamera])

  useEffect(() => {
    if (!cameraActive) return
    let cancelled = false
    let frameId = 0
    let detecting = false

    const scanFrame = async () => {
      if (cancelled) return
      const video = videoRef.current
      const detector = detectorRef.current

      if (video && detector && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !detecting) {
        detecting = true
        try {
          const codes = await detector.detect(video)
          const qr = codes.find((code) => code.format === 'qr_code' && code.rawValue)
          if (qr && !cancelled) {
            cancelled = true
            stopCamera()
            void submitRef.current(qr.rawValue)
            return
          }
        } catch {
          // A temporary frame decode failure should not interrupt camera playback.
        } finally {
          detecting = false
        }
      }

      if (!cancelled) frameId = window.requestAnimationFrame(scanFrame)
    }

    frameId = window.requestAnimationFrame(scanFrame)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
    }
  }, [cameraActive, stopCamera])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload = manualPayload.trim()
    if (!payload || checking) return
    void submitQrData(payload)
  }

  function handleCameraSwitch() {
    if (cameraOptions.length > 1) {
      const currentIndex = cameraOptions.findIndex((camera) => camera.deviceId === selectedCameraId)
      const nextCamera = cameraOptions[(currentIndex + 1 + cameraOptions.length) % cameraOptions.length]
      void startCamera({ deviceId: nextCamera.deviceId, facingMode })
      return
    }
    const nextFacingMode = facingMode === 'environment' ? 'user' : 'environment'
    void startCamera({ facingMode: nextFacingMode })
  }

  function renderAccessState() {
    if (accessState === 'checking') {
      return (
        <main className={styles.accessPage}>
          <div className={styles.accessCard} role="status"><LoaderCircle className={styles.spin} size={28} />{accessMessage}</div>
        </main>
      )
    }

    if (accessState !== 'ready') {
      return (
        <main className={styles.accessPage}>
          <section className={styles.accessCard}>
            {accessState === 'forbidden' ? <ShieldCheck size={30} /> : <AlertTriangle size={30} />}
            <h1>{accessState === 'signed-out' ? 'Требуется вход' : accessState === 'forbidden' ? 'Нет доступа' : 'Сервис временно недоступен'}</h1>
            <p>{accessMessage}</p>
            {accessState === 'error' && <button className={styles.secondaryButton} onClick={() => window.location.reload()}><RefreshCw size={18} /> Повторить</button>}
          </section>
        </main>
      )
    }

    return null
  }

  if (accessState !== 'ready') return renderAccessState()

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}><TicketCheck size={22} /></div>
          <div>
            <p className={styles.brandName}>FORUM.KG</p>
            <p className={styles.brandCaption}>ВХОД НА МЕРОПРИЯТИЕ</p>
          </div>
        </div>
        <div className={styles.staffBadge}>
          <ShieldCheck size={16} />
          <span>{staffName || 'Сотрудник'}</span>
          <span className={styles.roleBadge}>{staffRole}</span>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.pageIntro}>
          <div>
            <p className={styles.eyebrow}>EMPLOYEE SCANNER</p>
            <h1>Сканер билетов</h1>
            <p className={styles.introText}>Проверяйте каждый билет через защищённый Check-in сервис.</p>
          </div>
          <div className={styles.secureNote}><ShieldCheck size={18} /><span>Проверка на сервере</span></div>
        </section>

        <section className={styles.eventCard} aria-labelledby="event-heading">
          <div className={styles.sectionHeading}>
            <div className={styles.sectionIcon}><TicketCheck size={18} /></div>
            <div>
              <h2 id="event-heading">Мероприятие</h2>
              <p>Выберите событие, на которое регистрируете гостей</p>
            </div>
          </div>
          {events.length > 5 && (
            <label className={styles.eventSearch}>
              <span className={styles.srOnly}>Поиск мероприятия</span>
              <input value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Найти мероприятие" />
            </label>
          )}
          <div className={styles.selectWrap}>
            <select
              aria-label="Выбранное мероприятие"
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              disabled={events.length === 0 || cameraActive || checking || cameraStarting}
            >
              {filteredEvents.length === 0
                ? <option value="">Мероприятия не найдены</option>
                : filteredEvents.map((event) => <option key={event.id} value={event.id}>{eventTitle(event)} · {formatEventDate(event.startTime)}</option>)}
            </select>
            <ChevronDown aria-hidden="true" size={18} />
          </div>
          {eventsError && <p className={styles.inlineError}>{eventsError}</p>}
          {!eventsError && events.length === 0 && <p className={styles.emptyEvents}>Сейчас нет опубликованных мероприятий для проверки.</p>}
        </section>

        <div className={styles.scannerGrid}>
          <section className={styles.scannerCard} aria-labelledby="camera-heading">
            <div className={styles.scannerTopline}>
              <div className={styles.sectionHeading}>
                <div className={styles.sectionIcon}><ScanLine size={18} /></div>
                <div>
                  <h2 id="camera-heading">Сканирование QR</h2>
                  <p>Разместите QR-код внутри рамки</p>
                </div>
              </div>
              <span className={`${styles.cameraStatus} ${cameraActive ? styles.cameraOn : ''}`}>
                <span className={styles.statusDot} />{cameraActive ? 'КАМЕРА ВКЛЮЧЕНА' : 'ОСТАНОВЛЕНА'}
              </span>
            </div>

            <div className={styles.cameraStage}>
              <video ref={videoRef} className={styles.video} muted playsInline aria-label="Изображение с камеры для сканирования QR" />
              {!cameraActive && (
                <div className={styles.cameraPlaceholder}>
                  <div className={styles.cameraPlaceholderIcon}><Camera size={30} /></div>
                  <p>{cameraMessage}</p>
                </div>
              )}
              {cameraActive && <div className={styles.scanFrame} aria-hidden="true"><span /><span /><span /><span /></div>}
              {cameraActive && <div className={styles.scanHint}><ScanLine size={16} /> Поиск QR-кода…</div>}
            </div>

            {cameraError && <div className={styles.cameraError} role="alert"><AlertTriangle size={18} /><span>{cameraError}</span></div>}

            <div className={styles.cameraControls}>
              {!cameraActive ? (
                <button className={styles.primaryButton} onClick={() => void startCamera()} disabled={!selectedEventId || checking || cameraStarting}>
                  {cameraStarting ? <LoaderCircle className={styles.spin} size={20} /> : <Camera size={20} />}
                  {cameraStarting ? 'Запускаем…' : 'Включить камеру'}
                </button>
              ) : (
                <>
                  <button className={styles.primaryButton} onClick={stopCamera}><StopCircle size={20} /> Остановить</button>
                  <button className={styles.iconButton} onClick={handleCameraSwitch} disabled={cameraStarting} aria-label="Переключить камеру" title="Переключить камеру">
                    <SwitchCamera size={21} />
                  </button>
                </>
              )}
            </div>
            {!cameraActive && cameraError && <div className={styles.cameraFallback}><VideoOff size={16} /><span>Камера недоступна — можно проверить билет вручную ниже.</span></div>}
          </section>

          <section className={styles.manualCard} aria-labelledby="manual-heading">
            <div className={styles.sectionHeading}>
              <div className={styles.sectionIcon}><KeyboardIcon /></div>
              <div>
                <h2 id="manual-heading">Ручная проверка</h2>
                <p>Если камера недоступна</p>
              </div>
            </div>
            <form onSubmit={handleManualSubmit}>
              <label className={styles.fieldLabel} htmlFor="qr-payload">Содержимое QR-кода</label>
              <textarea
                id="qr-payload"
                className={styles.payloadInput}
                value={manualPayload}
                onChange={(event) => setManualPayload(event.target.value)}
                placeholder="FORUM.KG|номер_билета|токен"
                maxLength={2048}
                autoComplete="off"
                spellCheck={false}
                disabled={checking || cameraStarting}
                required
              />
              <p className={styles.fieldHint}>Нужен полный payload из QR. Один номер билета не подтверждает подлинность.</p>
              <button className={styles.manualButton} type="submit" disabled={checking || cameraStarting || !manualPayload.trim() || !selectedEventId}>
                {checking ? <LoaderCircle className={styles.spin} size={18} /> : <ArrowRight size={18} />}
                {checking ? 'Проверяем…' : 'Проверить билет'}
              </button>
            </form>
          </section>
        </div>

        <section className={styles.resultsGrid} aria-live="polite">
          <div className={styles.resultCard} aria-labelledby="result-heading">
            <div className={styles.resultHeading}>
              <div>
                <p className={styles.eyebrow}>РЕЗУЛЬТАТ</p>
                <h2 id="result-heading">Последняя проверка</h2>
              </div>
              {checking && <LoaderCircle className={styles.spin} size={22} />}
            </div>
            {!result ? (
              <div className={styles.noResult}>
                <div className={styles.noResultIcon}><ScanLine size={24} /></div>
                <p>Результат проверки появится здесь</p>
              </div>
            ) : (
              <ResultPanel result={result} />
            )}
          </div>

          <div className={styles.historyCard}>
            <div className={styles.resultHeading}>
              <div>
                <p className={styles.eyebrow}>ЭТА СЕССИЯ</p>
                <h2>Последние проверки</h2>
              </div>
              <span className={styles.historyCount}>{history.length}</span>
            </div>
            {history.length === 0 ? (
              <div className={styles.emptyHistory}>Проверки появятся в этом списке после сканирования.</div>
            ) : (
              <ul className={styles.historyList}>
                {history.map((item, index) => <HistoryItem key={`${item.checkedInAt}-${index}`} item={item} />)}
              </ul>
            )}
            <p className={styles.historyNote}>История хранится только в памяти этой страницы и не содержит QR-токены.</p>
          </div>
        </section>

        <footer className={styles.footer}><ShieldCheck size={15} /><span>SCANNER может выполнять только check-in. Решения о возвратах и настройках недоступны в этом интерфейсе.</span></footer>
      </div>
    </main>
  )
}

function SectionIconKeyboard() {
  return <span className={styles.keyboardGlyph} aria-hidden="true">⌨</span>
}

function KeyboardIcon() {
  return <SectionIconKeyboard />
}

function ResultPanel({ result }: { result: ScanResult }) {
  const Icon = result.status === 'VALID'
    ? CheckCircle2
    : result.status === 'ERROR' || result.status === 'UNPAID'
      ? AlertTriangle
      : XCircle

  return (
    <div className={`${styles.resultPanel} ${styles[`result${result.status}`]}`}>
      <div className={styles.resultStatusRow}>
        <Icon size={26} aria-hidden="true" />
        <span className={styles.resultBadge}>{statusLabel(result.status)}</span>
      </div>
      <h3>{statusTitle(result.status)}</h3>
      <p className={styles.resultMessage}>{result.message || defaultStatusMessage(result.status)}</p>
      {result.ticket && (
        <div className={styles.ticketSummary}>
          <div><span>Билет</span><strong>{result.ticket.ticketNumber}</strong></div>
          <div><span>Гость</span><strong>{result.ticket.participant.firstName} {result.ticket.participant.lastName}</strong></div>
          <div><span>Категория</span><strong>{result.ticket.category.name || result.ticket.category.code}</strong></div>
          <div><span>Мероприятие</span><strong>{result.ticket.forum.title}</strong></div>
        </div>
      )}
      {(result.ticketNumber || result.eventTitle) && !result.ticket && (
        <div className={styles.resultMeta}>
          {result.ticketNumber && <span>Билет: {result.ticketNumber}</span>}
          <span>{result.eventTitle}</span>
        </div>
      )}
      <div className={styles.checkedTime}><Clock3 size={15} />{formatEventDate(result.checkedInAt)}</div>
    </div>
  )
}

function HistoryItem({ item }: { item: ScanResult }) {
  const isValid = item.status === 'VALID'
  const isError = item.status === 'ERROR' || item.status === 'UNPAID'
  const Icon = isValid ? CheckCircle2 : isError ? AlertTriangle : XCircle

  return (
    <li className={styles.historyItem}>
      <div className={`${styles.historyIcon} ${isValid ? styles.historyValid : isError ? styles.historyError : styles.historyInvalid}`}>
        <Icon size={16} />
      </div>
      <div className={styles.historyInfo}>
        <strong>{item.ticketNumber || statusTitle(item.status)}</strong>
        <span>{item.eventTitle}</span>
      </div>
      <div className={styles.historyTime}>
        <span>{statusLabel(item.status)}</span>
        <time dateTime={item.checkedInAt}>{new Intl.DateTimeFormat('ru-KG', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.checkedInAt))}</time>
      </div>
    </li>
  )
}

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const UpdateContext = createContext(null)

const VERSION_URL = 'https://githaiga2861.github.io/golden-years-hcms/downloads/version.json'
const APK_URL = 'https://githaiga2861.github.io/golden-years-hcms/downloads/golden-years-care.apk'

export function UpdateProvider({ children }) {
  const [state, setState] = useState({ checking: true, available: false, error: false })

  const recheck = useCallback(async () => {
    setState((s) => ({ ...s, checking: true }))
    const current = import.meta.env.VITE_APP_VERSION || 'dev'
    try {
      const r = await fetch(VERSION_URL, { cache: 'no-store' })
      const data = await r.json()
      setState({ checking: false, available: data.version !== current, error: false, live: data })
    } catch {
      setState({ checking: false, available: false, error: true })
    }
  }, [])

  useEffect(() => { recheck() }, [recheck])

  return (
    <UpdateContext.Provider value={{ ...state, recheck, apkUrl: APK_URL }}>
      {children}
    </UpdateContext.Provider>
  )
}

export const useUpdate = () => useContext(UpdateContext)

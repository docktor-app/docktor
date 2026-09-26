import {useEffect, useState} from "react"

import {getProxyConfigs, getProxySettings, type ProxyConfig} from "@/lib/proxy-api"
import {getCertificates, type Certificate} from "@/lib/certificates-api"

export interface StackProxyState {
    configs: ProxyConfig[] | null
    deployed: boolean | null
    certificates: Certificate[]
    loading: boolean
    reload: () => Promise<void>
}

/**
 * Owns the Proxy tab's data load: proxy configs, proxy-stack deployed state,
 * and the certificate list, fetched together via Promise.all. Extracted
 * verbatim from proxy-tab.tsx's former load effect (same cancellation guard)
 * so ProxyTab can stay a thin composition of hook + presentational
 * components (D-03).
 */
export function useStackProxy(stackId: string): StackProxyState {
    const [configs, setConfigs] = useState<ProxyConfig[] | null>(null)
    const [deployed, setDeployed] = useState<boolean | null>(null)
    const [certificates, setCertificates] = useState<Certificate[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        async function load() {
            setLoading(true)
            try {
                const [cfgs, settings, certs] = await Promise.all([
                    getProxyConfigs(stackId),
                    getProxySettings(),
                    getCertificates(),
                ])
                if (cancelled) return
                setConfigs(cfgs)
                setDeployed(settings.deployed)
                setCertificates(certs)
            } catch {
                // silently fail — mirrors the previous proxy-tab.tsx load effect
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        void load()
        return () => {
            cancelled = true
        }
    }, [stackId])

    async function reload() {
        const cfgs = await getProxyConfigs(stackId)
        setConfigs(cfgs)
    }

    return {configs, deployed, certificates, loading, reload}
}

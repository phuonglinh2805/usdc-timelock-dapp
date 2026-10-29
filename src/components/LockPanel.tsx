import { useState, useMemo, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { Lock, Clock, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount, usdcDecimalsFor, Amount } from '@/onchain-money'

const TARGET_CHAIN_ID = 5042002 // Arc Testnet
const chain = requireChain(TARGET_CHAIN_ID)
const usdcFact = getUsdc(TARGET_CHAIN_ID)!

const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

const DURATION_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '1 hr', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
]

function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return 'Ready to withdraw'
  const d = Math.floor(secondsLeft / 86400)
  const h = Math.floor((secondsLeft % 86400) / 3600)
  const m = Math.floor((secondsLeft % 3600) / 60)
  const s = secondsLeft % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Stable timestamp updated by the parent interval clock
function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  // Use a module-level interval so it's not recreated per render
  return { now, setNow }
}

interface Props {
  contractAddress: `0x${string}`
  contractAbi: readonly object[]
}

export default function LockPanel({ contractAddress, contractAbi }: Props) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  const [amount, setAmount] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(60)
  const [activeSheet, setActiveSheet] = useState<'lock' | 'withdraw' | null>(null)
  const { now, setNow } = useNow()

  // Stable interval to tick the clock
  useState(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  })

  // Derived: unlock preview — no effect needed
  const unlockPreview = useMemo(
    () => new Date((now + durationSeconds) * 1000).toLocaleString(),
    [now, durationSeconds],
  )

  // USDC balance
  const { data: usdcBalance } = useReadContract({
    address: usdcFact.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const formattedBalance = usdcBalance
    ? Amount.fromRaw(usdcBalance, usdcDecimalsFor(TARGET_CHAIN_ID)).toFixed(2)
    : '0.00'

  // User's lock info
  const { data: lockData, refetch: refetchLock } = useReadContract({
    address: contractAddress,
    abi: contractAbi as never,
    functionName: 'getLock',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const lockAmount = lockData ? (lockData as [bigint, bigint])[0] : 0n
  const lockUnlockAt = lockData ? Number((lockData as [bigint, bigint])[1]) : 0
  const hasActiveLock = lockAmount > 0n
  const secondsLeft = Math.max(0, lockUnlockAt - now)
  const canWithdraw = hasActiveLock && secondsLeft === 0

  const formattedLockAmount = hasActiveLock
    ? Amount.fromRaw(lockAmount, usdcDecimalsFor(TARGET_CHAIN_ID)).toFixed(2)
    : '0.00'

  // USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcFact.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, contractAddress] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const parsedAmount = useMemo(() => {
    try {
      return amount ? parseAmount(TARGET_CHAIN_ID, amount) : null
    } catch {
      return null
    }
  }, [amount])

  const needsApproval = parsedAmount && allowance !== undefined && allowance < parsedAmount.raw

  // Approve USDC
  const { writeContract: approveUsdc, data: approveHash, isPending: isApprovePending, reset: resetApprove } =
    useWriteContract()

  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveHash,
    query: {
      enabled: !!approveHash,
      select(data) {
        if (data.status === 'success') {
          void refetchAllowance()
          toast.success('USDC approved')
          resetApprove()
        }
        return data
      },
    },
  })

  // Lock USDC
  const { writeContract: lockUsdc, data: lockHash, isPending: isLockPending, reset: resetLock } = useWriteContract()

  const { isLoading: isLockConfirming } = useWaitForTransactionReceipt({
    hash: lockHash,
    query: {
      enabled: !!lockHash,
      select(data) {
        if (data.status === 'success') {
          void refetchLock()
          toast.success('USDC locked successfully!')
          setAmount('')
          setActiveSheet(null)
          resetLock()
        }
        return data
      },
    },
  })

  // Withdraw USDC
  const {
    writeContract: withdrawUsdc,
    data: withdrawHash,
    isPending: isWithdrawPending,
    reset: resetWithdraw,
  } = useWriteContract()

  const { isLoading: isWithdrawConfirming } = useWaitForTransactionReceipt({
    hash: withdrawHash,
    query: {
      enabled: !!withdrawHash,
      select(data) {
        if (data.status === 'success') {
          void refetchLock()
          void refetchAllowance()
          toast.success('USDC withdrawn!')
          setActiveSheet(null)
          resetWithdraw()
        }
        return data
      },
    },
  })

  const isLockBusy = isApprovePending || isApproveConfirming || isLockPending || isLockConfirming
  const isWithdrawBusy = isWithdrawPending || isWithdrawConfirming

  const lockButtonLabel = () => {
    if (isApprovePending || isApproveConfirming)
      return (
        <>
          <Loader2 className="size-4 animate-spin" />
          {isApprovePending ? 'Confirm in wallet...' : 'Approving...'}
        </>
      )
    if (isLockPending)
      return (
        <>
          <Loader2 className="size-4 animate-spin" /> Confirm in wallet...
        </>
      )
    if (isLockConfirming)
      return (
        <>
          <Loader2 className="size-4 animate-spin" /> Locking...
        </>
      )
    if (needsApproval) return 'Allow USDC'
    return 'Lock USDC'
  }

  const withdrawButtonLabel = () => {
    if (isWithdrawPending)
      return (
        <>
          <Loader2 className="size-4 animate-spin" /> Confirm in wallet...
        </>
      )
    if (isWithdrawConfirming)
      return (
        <>
          <Loader2 className="size-4 animate-spin" /> Withdrawing...
        </>
      )
    return 'Withdraw USDC'
  }

  const handleLockAction = useCallback(() => {
    if (!parsedAmount || !address) return
    if (needsApproval) {
      approveUsdc({
        address: usdcFact.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [contractAddress, parsedAmount.raw],
        chainId: TARGET_CHAIN_ID,
      })
    } else {
      lockUsdc({
        address: contractAddress,
        abi: contractAbi as never,
        functionName: 'lock',
        args: [parsedAmount.raw, BigInt(durationSeconds)],
        chainId: TARGET_CHAIN_ID,
      })
    }
  }, [parsedAmount, address, needsApproval, approveUsdc, contractAddress, lockUsdc, contractAbi, durationSeconds])

  const handleWithdraw = useCallback(() => {
    withdrawUsdc({
      address: contractAddress,
      abi: contractAbi as never,
      functionName: 'withdraw',
      chainId: TARGET_CHAIN_ID,
    })
  }, [withdrawUsdc, contractAddress, contractAbi])

  return (
    <>
      <div className="space-y-3">
        {/* Hero card */}
        <section className="rounded-3xl p-5" style={glass.card}>
          <div className="mb-3 flex items-center gap-1.5">
            <div
              className="flex size-5 items-center justify-center rounded-md"
              style={{ background: 'rgba(18,45,69,0.09)' }}
            >
              <Lock className="size-3" style={{ color: 'var(--accent)' }} />
            </div>
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>
              Locked Balance
            </span>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {hasActiveLock ? formattedLockAmount : '0.00'}
            </span>
            <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>
              USDC
            </span>
          </div>

          {hasActiveLock ? (
            <div className="mt-3 flex items-center gap-2">
              <div
                className="rounded-xl px-3 py-1.5 text-sm font-semibold tabular-nums"
                style={
                  canWithdraw
                    ? { background: 'rgba(26,128,71,0.10)', color: 'var(--success)' }
                    : { background: 'rgba(18,45,69,0.07)', color: 'var(--ink-2)' }
                }
              >
                {canWithdraw ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    Ready to withdraw
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {formatCountdown(secondsLeft)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
              {isConnected
                ? `${address?.slice(0, 6)}\u2026${address?.slice(-4)} \u00b7 ${chain.name}`
                : 'Connect wallet to get started'}
            </p>
          )}
        </section>

        {/* Wallet balance */}
        {isConnected && (
          <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={glass.inner}>
            <div className="flex items-center gap-2">
              <TokenUSDC variant="branded" size={20} />
              <span className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                Wallet Balance
              </span>
            </div>
            <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
              {formattedBalance} USDC
            </span>
          </div>
        )}

        {/* Action row */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              if (isWrongChain) {
                switchChain({ chainId: TARGET_CHAIN_ID })
                return
              }
              if (!isConnected) return
              if (hasActiveLock) {
                toast.info('You already have an active lock. Withdraw first.')
                return
              }
              setActiveSheet('lock')
            }}
            disabled={isSwitching}
            className="rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {isSwitching ? <Loader2 className="mx-auto size-4 animate-spin" /> : 'Lock USDC'}
          </button>
          <button
            onClick={() => {
              if (isWrongChain) {
                switchChain({ chainId: TARGET_CHAIN_ID })
                return
              }
              if (!canWithdraw) return
              setActiveSheet('withdraw')
            }}
            disabled={!canWithdraw || isWithdrawBusy}
            className="rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={
              canWithdraw
                ? {
                    background: 'rgba(26,128,71,0.12)',
                    color: 'var(--success)',
                    border: '1px solid rgba(26,128,71,0.20)',
                  }
                : {
                    background: 'rgba(18,45,69,0.06)',
                    color: 'var(--muted)',
                    border: '1px solid rgba(18,45,69,0.10)',
                  }
            }
          >
            Withdraw
          </button>
        </div>

        {/* How it works */}
        <div className="rounded-2xl px-4 py-3 space-y-2" style={glass.inner}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            How it works
          </p>
          {[
            { step: '1', text: 'Choose an amount and lock duration' },
            { step: '2', text: 'Allow USDC access, then confirm the lock' },
            { step: '3', text: 'Withdraw once the countdown reaches zero' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-2.5">
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--accent)' }}
              >
                {item.step}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Lock sheet */}
      <AnimatePresence>
        {activeSheet === 'lock' && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveSheet(null)}
          >
            <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
            <motion.section
              className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
              style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(40px) saturate(200%)',
                WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-1" style={{ background: spectral }} />
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-black/10" />
              </div>
              <div className="px-5 pb-8 pt-2 space-y-4">
                <div>
                  <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
                    Lock USDC
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                    Balance: <span className="font-semibold">{formattedBalance} USDC</span>
                  </p>
                </div>

                {/* Amount input */}
                <div className="rounded-2xl p-4" style={glass.inner}>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, '')
                      if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                    }}
                    placeholder="0.00"
                    className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
                    style={{ color: 'var(--ink)' }}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                      USDC
                    </span>
                    <button
                      onClick={() => setAmount(formattedBalance)}
                      className="text-xs font-semibold"
                      style={{ color: 'var(--accent-hover)' }}
                    >
                      Max
                    </button>
                  </div>
                </div>

                {/* Duration presets */}
                <div>
                  <p
                    className="mb-2 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--muted)' }}
                  >
                    Lock Duration
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {DURATION_PRESETS.map((p) => (
                      <button
                        key={p.seconds}
                        onClick={() => setDurationSeconds(p.seconds)}
                        className="rounded-xl py-2 text-xs font-semibold transition-all"
                        style={
                          durationSeconds === p.seconds
                            ? { background: 'var(--accent)', color: 'white' }
                            : { background: 'rgba(18,45,69,0.07)', color: 'var(--ink-2)' }
                        }
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                    Unlocks: {unlockPreview}
                  </p>
                </div>

                {/* Preview row */}
                {parsedAmount && (
                  <div
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={glass.inner}
                  >
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      You lock
                    </span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {parseFloat(amount).toFixed(2)} USDC
                    </span>
                  </div>
                )}

                <button
                  disabled={!parsedAmount || isLockBusy}
                  onClick={handleLockAction}
                  className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  {lockButtonLabel()}
                </button>

                {lockHash && (
                  <a
                    href={buildTxExplorerUrl(TARGET_CHAIN_ID, lockHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 text-xs"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    View transaction <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Withdraw sheet */}
      <AnimatePresence>
        {activeSheet === 'withdraw' && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveSheet(null)}
          >
            <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
            <motion.section
              className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
              style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(40px) saturate(200%)',
                WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-1" style={{ background: spectral }} />
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-black/10" />
              </div>
              <div className="px-5 pb-8 pt-2 space-y-4">
                <div>
                  <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
                    Withdraw USDC
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                    Your lock has expired
                  </p>
                </div>

                <div className="rounded-2xl p-4 flex items-center gap-3" style={glass.inner}>
                  <CheckCircle2 className="size-8 shrink-0" style={{ color: 'var(--success)' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {formattedLockAmount} USDC available
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      Lock period ended
                    </p>
                  </div>
                </div>

                <button
                  disabled={isWithdrawBusy}
                  onClick={handleWithdraw}
                  className="w-full rounded-2xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: 'rgba(26,128,71,0.12)',
                    color: 'var(--success)',
                    border: '1px solid rgba(26,128,71,0.25)',
                  }}
                >
                  {withdrawButtonLabel()}
                </button>

                {withdrawHash && (
                  <a
                    href={buildTxExplorerUrl(TARGET_CHAIN_ID, withdrawHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 text-xs"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    View transaction <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

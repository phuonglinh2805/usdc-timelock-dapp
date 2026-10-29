import { ConnectKitButton } from 'connectkit'
import { Lock } from 'lucide-react'
import LockPanel from '@/components/LockPanel'
import artifact from '../contracts/out/USDCTimeLock.sol/USDCTimeLock.json'

const CONTRACT_ADDRESS = '0x8cc59953a9031213f53109167005cb19c9eac6df' as const

export default function App() {
  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)' }}
    >
      {/* Ambient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          style={{
            position: 'absolute', top: '8%', left: '5%',
            width: 280, height: 280, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute', bottom: '8%', right: '8%',
            width: 260, height: 260, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)',
            filter: 'blur(58px)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-10 pt-6">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex size-8 items-center justify-center rounded-xl"
              style={{ background: 'var(--accent)' }}
            >
              <Lock className="size-4 text-white" />
            </div>
            <span className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
              TimeLock
            </span>
          </div>
          <ConnectKitButton />
        </header>

        <main>
          <LockPanel contractAddress={CONTRACT_ADDRESS} contractAbi={artifact.abi} />
        </main>

        <footer className="mt-8 text-center">
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Contract on{' '}
            <a
              href={`https://explorer.testnet.arc.io/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline-offset-2 hover:underline"
              style={{ color: 'var(--accent-hover)' }}
            >
              Arc Testnet
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}

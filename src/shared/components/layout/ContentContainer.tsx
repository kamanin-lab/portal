interface Props {
  children: React.ReactNode
  width?: 'narrow' | 'wide'
  className?: string
}

export function ContentContainer({ children, width = 'narrow', className = '' }: Props) {
  return (
    <div className={`mx-auto w-full ${width === 'narrow' ? 'max-w-4xl' : 'max-w-6xl'} ${className}`}>
      {children}
    </div>
  )
}

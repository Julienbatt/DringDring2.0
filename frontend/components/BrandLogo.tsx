import Image from 'next/image'

type BrandLogoProps = {
  className?: string
  width?: number
  height?: number
  priority?: boolean
  quality?: number
  flip?: boolean
  alt: string
}

export default function BrandLogo({
  className,
  width = 302,
  height = 91,
  priority = false,
  quality = 100,
  flip = false,
  alt,
}: BrandLogoProps) {
  const classes = ['w-auto', className].filter(Boolean).join(' ')

  return (
    <Image
      src="/brand/logo-Dring-Dring2.png"
      alt={alt}
      width={width}
      height={height}
      className={classes}
      priority={priority}
      quality={quality}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    />
  )
}

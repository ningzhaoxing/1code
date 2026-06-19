import * as React from "react"
import { cn } from "../../lib/utils"

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  fill?: string
}

// VoidForge mark — a target/acquisition corner frame (the "void" / unknown target)
// holding a solid forged core (the "forge" / verified finding). Single-color: the
// `fill` prop (default currentColor) colors both the frame stroke and the core.
export function Logo({ fill = "currentColor", className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full", className)}
      aria-label="VoidForge logo"
      {...props}
    >
      <g
        stroke={fill}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 11V6h5" />
        <path d="M21 6h5v5" />
        <path d="M6 21v5h5" />
        <path d="M21 26h5v-5" />
      </g>
      <path d="M16 10l6 6-6 6-6-6z" fill={fill} />
    </svg>
  )
}

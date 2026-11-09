import { PageTransition } from "@/components/motion/primitives";

/** Re-mounts on every tab navigation, so each page settles in with the same entrance. */
export default function ProjectTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}

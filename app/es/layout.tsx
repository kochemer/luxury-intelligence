import RootShell, { rootMetadata, rootViewport } from '@/app/components/RootShell';

export const metadata = rootMetadata;
export const viewport = rootViewport;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="es">{children}</RootShell>;
}

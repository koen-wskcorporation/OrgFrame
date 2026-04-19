export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <div className="-mt-[var(--layout-gap)]">{children}</div>;
}

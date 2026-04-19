export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <div className="-mt-[var(--layout-gap)]">{children}</div>;
}

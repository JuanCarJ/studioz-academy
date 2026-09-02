export const useRouter = () => ({
  push: (url: string) => window.location.assign(url),
  replace: (url: string) => window.location.replace(url),
  refresh: () => {},
})
export const useSearchParams = () => new URLSearchParams(window.location.search)
export const usePathname = () => window.location.pathname

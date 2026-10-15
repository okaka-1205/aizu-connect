const variants = {
  chromium: { display: "Desktop", suffix: "desktop" },
  mobile: { display: "Mobile", suffix: "mobile" },
  tablet: { display: "Tablet", suffix: "tablet" },
  firefox: { display: "Firefox", suffix: "firefox" },
  webkit: { display: "WebKit", suffix: "webkit" },
} as const;

export function projectVariant(projectName: string) {
  return variants[projectName as keyof typeof variants]?.display ?? projectName;
}

export function projectSuffix(projectName: string) {
  return variants[projectName as keyof typeof variants]?.suffix ?? projectName;
}

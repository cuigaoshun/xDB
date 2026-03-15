import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 移除语法高亮主题的背景色，使其透明
 * 用于让代码块与容器背景无缝融合
 */
export function transparentTheme(theme: Record<string, any>): Record<string, any> {
  const newTheme = { ...theme };
  const transparent = { background: 'transparent', textShadow: 'none' };

  if (newTheme['pre[class*="language-"]']) {
    newTheme['pre[class*="language-"]'] = { ...newTheme['pre[class*="language-"]'], ...transparent };
  }
  if (newTheme['code[class*="language-"]']) {
    newTheme['code[class*="language-"]'] = { ...newTheme['code[class*="language-"]'], ...transparent };
  }
  return newTheme;
}

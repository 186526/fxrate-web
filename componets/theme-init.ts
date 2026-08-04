// 预绘制主题初始化的共享常量与内联脚本（Phase 4B 任务 13：消除 dark-mode 背景白闪）。
// 完整 MUI 组件 palette 仍由 hydration 后的 ThemeProvider 切换。
//
// ThemeProvider 与 layout 的 beforeInteractive 脚本共用同一把键：脚本在 hydration 前
// 把解析出的主题写到 <html data-theme>，ThemeProvider 以该属性为单一事实来源读取。

export const THEME_KEY = "fxrate-theme"
export const THEME_ATTR = "data-theme"

// 在首帧绘制前（layout 的 next/script beforeInteractive）执行的严格模式 IIFE：
//   1. 读 localStorage["fxrate-theme"]（仅接受 "light"/"dark"）；
//   2. 缺省回落 prefers-color-scheme: dark；
//   3. 把结果写到 <html data-theme> + style.colorScheme，供 globals.css 与
//      ThemeProvider 在 hydration 前就拿到正确主题（暗色用户不再先看到白屏）。
// 每步独立 try：localStorage/matchMedia 任一不可用只跳过该步，仍会尽力写属性，绝不抛错。
// 注意：内容不能包含 "</script>" 序列，否则 HTML 解析器会提前截断脚本。
export const themeInitScript = `(function(){var m="light";var found=false;try{var s=localStorage.getItem("fxrate-theme");if(s==="light"||s==="dark"){m=s;found=true}}catch(err){}if(!found){try{if(window.matchMedia("(prefers-color-scheme: dark)").matches)m="dark"}catch(err){}}try{var d=document.documentElement;d.setAttribute("data-theme",m);d.style.colorScheme=m}catch(err){}})();`

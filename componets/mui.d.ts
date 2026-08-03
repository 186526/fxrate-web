// Sunoaki 风格主题的 MUI 类型增强：自定义 palette 角色 + Button 自定义变体
import "@mui/material/styles"

declare module "@mui/material/styles" {
	interface Palette {
		brandSoft: string
		surfaceMuted: string
	}
	interface PaletteOptions extends Partial<Palette> {}
}

declare module "@mui/material/Button" {
	interface ButtonPropsVariantOverrides {
		tonal: true
	}
}

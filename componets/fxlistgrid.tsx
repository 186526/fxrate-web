import { DataGrid, GridColDef } from "@mui/x-data-grid";

import { zhCN } from "@mui/x-data-grid/locales";
import { sourceNamesInZH } from "@/lib/fxrate/src/handler/rss";

export interface FXListProps {
	name: string;
	type: {
		buy: {
			cash?: number | string;
			remit?: number | string;
		};
		sell: {
			cash?: number | string;
			remit?: number | string;
		};
		middle: number | string;
	};
	updated: Date;
	id?: number;
}

const columns: GridColDef[] = [
	{ field: "name", headerName: "银行/平台", width: 150 },
	{ field: "buyCash", headerName: "购钞价" },
	{ field: "buyRemit", headerName: "购汇价" },
	{ field: "sellCash", headerName: "结钞价" },
	{ field: "sellRemit", headerName: "结汇价" },
	{ field: "middle", headerName: "中间价" },
	{ field: "updated", headerName: "更新时间", width: 300 },
];

const nameMapping: { [x: string]: string } = sourceNamesInZH;

function getName(name: string): string {
	if (nameMapping[name]) {
		return nameMapping[name] + ` (${name})`;
	} else return name;
}

export default function FXListGrid({ props }: { props: FXListProps[] }) {
	const result = props.sort().map((k, i) => {
		k.id = i + 1;
		return {
			id: k.id,
			name: getName(k.name),
			updated: k.updated.toString(),
			buyCash: k.type.buy.cash,
			sellCash: k.type.sell.cash,
			buyRemit: k.type.buy.remit,
			sellRemit: k.type.sell.remit,
			middle: k.type.middle,
		};
	});

	return (
		<DataGrid
			rows={result}
			columns={columns}
			localeText={zhCN.components.MuiDataGrid.defaultProps.localeText}
		/>
	);
}

"use client"
import * as React from "react"
import Box from "@mui/material/Box"
import Alert from "@mui/material/Alert"
import Button from "@mui/material/Button"
import LinearProgress from "@mui/material/LinearProgress"
import CurrencyChooser from "./currencyChooser"
import FXListGrid, { FXListProps } from "./fxlistgrid"
import FXMatrixGrid from "./fxmatrixgrid"
import { ListTableSkeleton, MatrixTableSkeleton } from "./tableSkeleton"
import { type RatesMatrix } from "./tools"
import { hasPairQuotes, hasMatrixQuotes, MATRIX_SLOW_SOURCES, type View } from "./view-utils"

export interface IndexContentProps {
	view: View
	currencies: { [source: string]: string[] } | null
	allCurrencies: string[]
	pairFrom: string
	pairTo: string
	pairReqFrom: string
	pairReqTo: string
	pairReverse: boolean
	matrixBase: string
	matrixReverse: boolean
	amount: number
	precision: number
	crossRates: boolean
	result: FXListProps[] | null
	matrix: RatesMatrix | null
	visiblePair: FXListProps[] | null
	visibleMatrix: RatesMatrix | null
	visiblePairLoading: boolean
	visibleMatrixLoading: boolean
	pairError: string | null
	matrixError: string | null
	loadError: string | null
	setCurrenciesLoadAttempt: React.Dispatch<React.SetStateAction<number>>
	setPairFrom: (value: string) => void
	setPairTo: (value: string) => void
	setMatrixBase: (value: string) => void
	setAmount: (value: number) => void
	handleSwap: () => void
	handleReverseToggle: () => void
	fetchPair: (force: boolean) => void
	fetchMatrix: (force: boolean) => void
	matrixExtraRowsGeneration: number
}

export default function IndexContent(props: IndexContentProps) {
	const {
		view, currencies, allCurrencies, pairFrom, pairTo, pairReqFrom, pairReqTo,
		pairReverse, matrixBase, matrixReverse, amount, precision, crossRates,
		visiblePair, visibleMatrix, visiblePairLoading, visibleMatrixLoading,
		pairError, matrixError, loadError, setCurrenciesLoadAttempt, setPairFrom,
		setPairTo, setMatrixBase, setAmount, handleSwap, handleReverseToggle,
		fetchPair, fetchMatrix, matrixExtraRowsGeneration,
	} = props
	return (
		<Box sx={{ width: "100%", maxWidth: 1080, mx: "auto", px: { xs: 1, sm: 2 }, py: 2 }}>
			{loadError ? (
				<Alert severity="error" action={<Button color="inherit" size="small" onClick={() => setCurrenciesLoadAttempt((attempt) => attempt + 1)}>重试</Button>}>
					{loadError}
				</Alert>
			) : (
				<>
					<CurrencyChooser
						currencies={allCurrencies}
						from={view == "matrix" ? matrixBase : pairFrom}
						to={view == "matrix" ? matrixBase : pairTo}
						amount={amount}
						onFromChange={view == "matrix" ? setMatrixBase : setPairFrom}
						onToChange={setPairTo}
						onSwap={handleSwap}
						onAmountChange={setAmount}
						showTo={view == "pair"}
						fromLabel={view == "matrix" && matrixReverse ? "目标货币" : undefined}
						reverse={view == "matrix" ? matrixReverse : pairReverse}
						onReverseChange={handleReverseToggle}
					/>
					<Box sx={{ mt: 2 }}>
						{view == "pair" ? (
							<>
								{pairError && !hasPairQuotes(visiblePair) && (
									<Alert severity="error" action={<Button color="inherit" size="small" onClick={() => fetchPair(true)}>重试</Button>} sx={{ mb: 1 }}>{pairError}</Alert>
								)}
								{visiblePairLoading && visiblePair != null && <LinearProgress sx={{ mb: 1 }} />}
								{visiblePairLoading && visiblePair == null ? <ListTableSkeleton /> : visiblePair && visiblePair.length > 0 ? <FXListGrid props={visiblePair} from={pairReqFrom} to={pairReqTo} amount={amount} /> : !pairError ? <Alert severity="info">该货币对暂无可用的银行报价，试试其他货币对</Alert> : null}
							</>
						) : (
							<>
								{matrixError && !hasMatrixQuotes(visibleMatrix) && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => fetchMatrix(true)}>重试</Button>} sx={{ mb: 1 }}>{matrixError}</Alert>}
								{visibleMatrixLoading && visibleMatrix != null && <LinearProgress sx={{ mb: 1 }} />}
								{visibleMatrixLoading && visibleMatrix == null ? <MatrixTableSkeleton /> : visibleMatrix && Object.keys(visibleMatrix).length > 0 ? <FXMatrixGrid data={visibleMatrix} from={matrixBase} amount={amount} precision={precision} slowSources={MATRIX_SLOW_SOURCES} sourceCurrencies={currencies ?? undefined} crossRates={crossRates} reverse={matrixReverse} refreshGeneration={matrixExtraRowsGeneration} /> : !matrixError ? <Alert severity="info">暂无矩阵数据</Alert> : null}
							</>
						)}
					</Box>
				</>
			)}
		</Box>
	)
}

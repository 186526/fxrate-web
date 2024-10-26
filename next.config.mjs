/** @type {import('next').NextConfig} */
import buildId from "next-build-id";
import { dirname } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
	eslint: {
		// Warning: This allows production builds to successfully complete even if
		// your project has ESLint errors.
		ignoreDuringBuilds: true,
	},
	typescript: {
		// !! WARN !!
		// Dangerously allow production builds to successfully complete even if
		// your project has type errors.
		// !! WARN !!
		ignoreBuildErrors: true,
	},
	generateBuildId: async () => {
		return await buildId({ dir: __dirname, describe: true }).catch((e) => {
			return env.NODE_ENV === "production" ? "production" : "development";
		});
	},
	output: "standalone",
};

export default nextConfig;

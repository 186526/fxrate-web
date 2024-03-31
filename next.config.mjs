/** @type {import('next').NextConfig} */
import buildId from "next-build-id";

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
	generateBuildId: async () =>
		await buildId({ dir: __dirname, describe: true }),
};

export default nextConfig;

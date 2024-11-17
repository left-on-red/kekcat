import chroma, { type InterpolationMode } from 'chroma-js';
import { Readable } from 'stream';

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, c) => {
	for (let _ = 0; _ < 8; _++) {
		c = ((c & 1) * 0xEDB88320) ^ (c >>> 1);
	}
	return c;
});

function crc32(str: string, crc = 0) {
	const buf = (new TextEncoder()).encode(str);
	crc = ~crc
	for (let i = 0; i < buf.length; i++) {
		crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
	}
	return ~crc >>> 0;
}

function ansi256(r: number, g: number, b: number) {
	if (r >> 4 === g >> 4 && g >> 4 === b >> 4) {
		if (r < 8) return 16;
		if (r > 248) return 231;
		return Math.round(((r - 8) / 247) * 24) + 232;
	}

	return 16
		+ (36 * Math.round(r / 255 * 5))
		+ (6 * Math.round(g / 255 * 5))
		+ Math.round(b / 255 * 5);
}

function ansi16(r: number, g: number, b: number) {
	const value = Math.round(chroma.rgb(r, g, b).hsv()[2] / 50);
	if (value === 0) return 30;
	const ansi = 30
		+ ((Math.round(b / 255) << 2)
		| (Math.round(g / 255) << 1)
		| Math.round(r / 255));
	return value === 2 ? ansi + 60 : ansi;
}

function getTokenGenerator(force = false) {
	if (force || process.stdout.hasColors(2 ** 24)) {
		return (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
	} else if (process.stdout.hasColors(2 ** 8)) {
		return (r: number, g: number, b: number) => `\x1b[38;5;${ansi256(r, g, b)}m`;
	} else if (process.stdout.hasColors()) {
		return (r: number, g: number, b: number) => `\x1b[1;${ansi16(r, g, b)}m`;
	} else {
		return () => '';
	}
}

function random(x: number) {
	let t = x += 0x6D2B79F5;
	t = Math.imul(t ^ t >>> 15, t | 1);
	t ^= t + Math.imul(t ^ t >>> 7, t | 61);
	return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

function position(steps: number, offset: number) {
	const cycle = Math.floor(offset / steps);
	const current = (offset - (cycle * steps)) / steps;
	return cycle % 2 === 0 ? current : 1 - current;
}

type KekConfig = Partial<{
	mode: InterpolationMode,
	step: number,
	stagger: number,
	seed: string | null,
	stops: string[],
	forceTrueRGB: boolean,
}>;

export function getFrameColorizer(config?: KekConfig) {
	const mode = config?.mode ?? 'lrgb';
	const step = config?.step ?? 0.3;
	const stagger = config?.stagger ?? 1;
	const seed = config?.seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : config?.seed === null ? null : crc32(config.seed);
	const stops = config?.stops ?? ['f00','f0f', '00f', '0ff', '0f0', 'ff0'];
	const forceTrueRGB = config?.forceTrueRGB ?? false;

	const totalSteps = Math.floor(1 / (step / 10));
	const start = seed === null ? 0 : random(seed) * totalSteps;
	const scale = chroma.scale(stops).mode(mode);
	const getToken = getTokenGenerator(forceTrueRGB);

	let frame = 0;
	return (str: string) => {
		const output = str.split('\n').map((line, l) => {
			const offset = start + ((l + frame) * stagger);
			return[...line].map((char, c) => {
				const rgb = scale(position(totalSteps, offset + c)).rgb(true);
				return getToken(...rgb) + char;
			}).join('');
		}).join('\n') + '\n';
		frame++;
		return output;
	}
}

class KekStream extends Readable {
	constructor(readable: NodeJS.ReadableStream, colorize: (str: string) => string) {
		super({ encoding: 'utf8', });

		readable.resume();
		readable.setEncoding('utf8');

		readable.on('data', (line: string) => this.push(colorize(line) + '\x1b[0m'));
		readable.on('end', this.destroy);
		readable.on('error', this.destroy);
	}

	_read(size: number): void {}

	pipe<T extends NodeJS.WritableStream>(destination: T, options?: { end?: boolean | undefined; } | undefined): T {
		return super.pipe(destination, options);
	}
}

export function createStream(readable: NodeJS.ReadableStream, colorize: (str: string) => string) {
	return new KekStream(readable, colorize);
}
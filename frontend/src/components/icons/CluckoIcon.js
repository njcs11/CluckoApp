import React from 'react';

/**
 * CluckoIcon: High-precision SVG vectorization of Clucko's signature chicken icon.
 * Supports smooth hardware-accelerated CSS transforms, clean scaling without pixelation,
 * dynamic colors, and animations.
 */
export default function CluckoIcon({
  size = 22,
  color = 'currentColor',
  className = '',
  style = {},
  ...props
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill={color}
      fillRule="evenodd"
      className={`clucko-svg-icon ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        transition: 'transform 0.2s ease, filter 0.2s ease',
        ...style
      }}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Outer chicken silhouette */}
      <path d="M 430 41 L 410 40 L 394 29 L 387 30 L 374 45 L 368 48 L 361 48 L 356 51 L 346 67 L 346 74 L 354 89 L 346 100 L 338 116 L 323 132 L 306 143 L 287 150 L 255 155 L 220 164 L 187 165 L 168 161 L 121 140 L 93 132 L 81 126 L 60 110 L 56 110 L 52 115 L 49 146 L 52 164 L 56 176 L 62 186 L 54 186 L 50 190 L 53 213 L 60 231 L 75 251 L 86 260 L 101 268 L 92 272 L 92 280 L 96 289 L 105 297 L 129 306 L 146 317 L 161 332 L 179 363 L 193 377 L 211 387 L 224 390 L 241 390 L 243 392 L 245 456 L 242 459 L 220 465 L 221 470 L 247 471 L 281 483 L 283 479 L 273 471 L 296 470 L 298 468 L 295 464 L 265 460 L 258 456 L 260 399 L 262 394 L 269 390 L 352 383 L 357 389 L 356 397 L 354 399 L 349 398 L 345 402 L 355 411 L 353 413 L 343 415 L 341 419 L 353 424 L 349 438 L 350 442 L 354 442 L 360 432 L 367 411 L 368 395 L 371 385 L 370 375 L 363 370 L 316 368 L 321 361 L 336 347 L 345 342 L 371 334 L 387 326 L 405 312 L 423 289 L 433 267 L 437 248 L 437 222 L 433 203 L 417 168 L 426 165 L 431 160 L 435 151 L 437 138 L 447 148 L 451 149 L 453 147 L 460 130 L 461 111 L 454 92 L 445 82 L 451 75 L 452 68 L 437 55 Z" />
      {/* Inner body contour */}
      <path d="M 440 112 L 438 116 L 421 113 L 406 118 L 394 131 L 389 145 L 389 159 L 393 171 L 410 201 L 414 213 L 417 232 L 413 261 L 403 282 L 386 301 L 373 310 L 337 323 L 321 332 L 308 344 L 296 360 L 279 369 L 228 370 L 215 366 L 205 360 L 196 351 L 185 330 L 174 315 L 150 294 L 127 282 L 137 269 L 137 262 L 134 257 L 128 253 L 109 249 L 94 240 L 80 224 L 77 214 L 96 213 L 110 207 L 109 202 L 93 192 L 79 176 L 71 154 L 73 145 L 87 152 L 122 163 L 159 180 L 180 185 L 211 186 L 227 184 L 264 174 L 292 170 L 322 158 L 336 148 L 352 132 L 368 104 L 380 93 L 397 87 L 412 87 L 421 90 L 434 100 Z" />
      {/* Wing feather detailing */}
      <path d="M 355 238 L 354 236 L 349 236 L 337 258 L 316 280 L 300 289 L 280 294 L 265 293 L 272 286 L 279 270 L 280 256 L 276 252 L 273 255 L 265 275 L 254 285 L 240 289 L 228 289 L 219 285 L 232 278 L 239 271 L 245 258 L 246 249 L 244 247 L 239 249 L 235 259 L 228 266 L 214 271 L 196 268 L 179 257 L 177 258 L 177 263 L 183 273 L 192 280 L 204 294 L 216 301 L 227 304 L 235 304 L 259 312 L 284 312 L 302 307 L 316 300 L 338 280 L 349 261 Z" />
    </svg>
  );
}

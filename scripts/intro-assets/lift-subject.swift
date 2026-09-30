// Lifts the foreground subject out of a photo using Apple's Vision framework
// (the same model as "Lift subject from background" in Photos). macOS 14+.
//
//   swift scripts/intro-assets/lift-subject.swift <input> <cutout.png> <mask.png>
//
// cutout.png: full-size RGBA image, background transparent.
// mask.png:   full-size grayscale mask (white = subject), used to build
//             background plates with the subject removed.

import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count == 4 else {
  FileHandle.standardError.write("usage: lift-subject <input> <cutout.png> <mask.png>\n".data(using: .utf8)!)
  exit(64)
}

let input = URL(fileURLWithPath: args[1])
let cutoutURL = URL(fileURLWithPath: args[2])
let maskURL = URL(fileURLWithPath: args[3])

let handler = VNImageRequestHandler(url: input)
let request = VNGenerateForegroundInstanceMaskRequest()

do {
  try handler.perform([request])
  guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
    FileHandle.standardError.write("no subject found in \(input.lastPathComponent)\n".data(using: .utf8)!)
    exit(2)
  }

  let context = CIContext()
  let srgb = CGColorSpace(name: CGColorSpace.sRGB)!

  let masked = try observation.generateMaskedImage(
    ofInstances: observation.allInstances, from: handler, croppedToInstancesExtent: false)
  try context.writePNGRepresentation(
    of: CIImage(cvPixelBuffer: masked), to: cutoutURL, format: .RGBA8, colorSpace: srgb)

  let mask = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
  try context.writePNGRepresentation(
    of: CIImage(cvPixelBuffer: mask), to: maskURL, format: .L8, colorSpace: CGColorSpace(name: CGColorSpace.linearGray)!)

  print("lifted \(observation.allInstances.count) instance(s) from \(input.lastPathComponent)")
} catch {
  FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
  exit(1)
}

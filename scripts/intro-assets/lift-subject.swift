// Lifts the foreground subject out of a photo using Apple's Vision framework
// (the same model as "Lift subject from background" in Photos). macOS 14+.
//
//   swift scripts/intro-assets/lift-subject.swift <input> <cutout.png>
//
// cutout.png: full-size RGBA image, background transparent.

import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count == 3 else {
  FileHandle.standardError.write("usage: lift-subject <input> <cutout.png>\n".data(using: .utf8)!)
  exit(64)
}

let input = URL(fileURLWithPath: args[1])
let cutoutURL = URL(fileURLWithPath: args[2])

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

  print("lifted \(observation.allInstances.count) instance(s) from \(input.lastPathComponent)")
} catch {
  FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
  exit(1)
}

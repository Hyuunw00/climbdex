import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 4, let t = Double(args[2]) else { print("usage: frame <video> <seconds> <out.jpg>"); exit(1) }
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = CMTime(seconds: 0.1, preferredTimescale: 600)
let image = try gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil)
let rep = NSBitmapImageRep(cgImage: image)
let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.92])!
try data.write(to: URL(fileURLWithPath: args[3]))
print("\(image.width)x\(image.height) -> \(args[3])")

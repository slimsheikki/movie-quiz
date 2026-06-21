// Zero-dependency frame analyzer using Apple's Vision framework (macOS native).
// Reads newline-delimited image paths on stdin, prints one JSON object per line:
//   {"path":..,"text":[..],"faces":Int,"persons":Int}   or   {"path":..,"error":".."}
// Compile once:  swiftc -O vision.swift -o vision-bin
import Foundation
import Vision
import AppKit

func emit(_ obj: [String: Any]) {
    if let d = try? JSONSerialization.data(withJSONObject: obj),
       let s = String(data: d, encoding: .utf8) {
        print(s)
    }
}

while let line = readLine(strippingNewline: true) {
    let path = line.trimmingCharacters(in: .whitespaces)
    if path.isEmpty { continue }
    autoreleasepool {
        guard let img = NSImage(contentsOfFile: path),
              let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            emit(["path": path, "error": "load"]); return
        }
        let handler = VNImageRequestHandler(cgImage: cg, options: [:])
        let textReq = VNRecognizeTextRequest()
        textReq.recognitionLevel = .accurate
        textReq.usesLanguageCorrection = true
        let faceReq = VNDetectFaceRectanglesRequest()
        let personReq = VNDetectHumanRectanglesRequest()
        do {
            try handler.perform([textReq, faceReq, personReq])
        } catch {
            emit(["path": path, "error": "vision"]); return
        }
        let texts = (textReq.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        emit([
            "path": path,
            "text": texts,
            "faces": faceReq.results?.count ?? 0,
            "persons": personReq.results?.count ?? 0,
        ])
    }
    fflush(stdout)
}

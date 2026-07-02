import { VirtualKeyboard } from '../common/VirtualKeyboard';
import type { KeyboardLayout } from '../../types/kle';
import type { Point } from '../../types/geometry';

interface CalibrationKeyboardGuideProps {
  layout: KeyboardLayout;
  highlightKeyIndices: number[];
  previewPointers: Point[];
  homePointers: Point[];
}

export const CalibrationKeyboardGuide = ({
  layout,
  highlightKeyIndices,
  previewPointers,
  homePointers,
}: CalibrationKeyboardGuideProps) => (
  <div className="calibration-keyboard-guide">
    <VirtualKeyboard
      layout={layout}
      unitSize={38}
      gap={5}
      targetKeyIndex={highlightKeyIndices.length > 0 ? highlightKeyIndices[0] : null}
      highlightKeyIndices={highlightKeyIndices}
      pointers={previewPointers}
      homePointers={homePointers}
    />
  </div>
);

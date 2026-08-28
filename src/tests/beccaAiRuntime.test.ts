import type { BeccaAIInterpreter } from "../services/becca/aiInterpreter";
import {
  configureBeccaAI,
  getBeccaAIInterpreter,
} from "../services/becca/aiRuntime";

describe("Becca AI runtime", () => {
  afterEach(() => configureBeccaAI(undefined));

  it("uses no interpreter by default", () => {
    expect(getBeccaAIInterpreter()).toBeUndefined();
  });

  it("registers and clears an optional interpreter", () => {
    const interpreter: BeccaAIInterpreter = {
      interpret: jest.fn().mockResolvedValue({ capabilityId: null }),
    };

    configureBeccaAI(interpreter);
    expect(getBeccaAIInterpreter()).toBe(interpreter);

    configureBeccaAI(undefined);
    expect(getBeccaAIInterpreter()).toBeUndefined();
  });
});

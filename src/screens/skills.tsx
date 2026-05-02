import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  listSkillDefinitions,
  type SkillDefinition,
} from "../extensibility/skills/index.js";

type SkillsScreenProps = {
  onBack: () => void;
};

function formatActivation(skill: SkillDefinition): string {
  const modes = [
    skill.activation.manual ? "manual" : null,
    skill.activation.auto ? "auto" : null,
  ].filter(Boolean);

  return modes.length > 0 ? modes.join(", ") : "none";
}

function formatSignals(skill: SkillDefinition): string {
  const signals = [
    skill.activation.keywords.length > 0
      ? `keywords:${skill.activation.keywords.length}`
      : null,
    skill.activation.filePatterns.length > 0
      ? `files:${skill.activation.filePatterns.length}`
      : null,
    skill.activation.toolNames.length > 0
      ? `tools:${skill.activation.toolNames.length}`
      : null,
  ].filter(Boolean);

  return signals.length > 0 ? signals.join(" · ") : "no activation signals";
}

export function SkillsScreen({ onBack }: SkillsScreenProps) {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function loadSkills() {
      setIsLoading(true);
      setError(null);

      try {
        const nextSkills = await listSkillDefinitions();

        if (!isCancelled) {
          setSkills(nextSkills);
        }
      } catch (error_) {
        if (!isCancelled) {
          setError(
            error_ instanceof Error
              ? error_.message
              : "Unknown error loading skills.",
          );
          setSkills([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSkills();

    return () => {
      isCancelled = true;
    };
  }, []);

  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === "q") {
      onBack();
    }
  });

  return (
    <Box
      width="90%"
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      paddingY={1}>
      <Text bold>Declarative skills</Text>
      <Text dimColor>
        Use @skill:identifier in your prompt to activate a skill for one turn.
      </Text>
      <Text dimColor>
        Manage skills through natural language/tool calling or direct JSON for now.
      </Text>

      <Box marginTop={1} flexDirection="column">
        {isLoading ? <Text dimColor>Loading skills...</Text> : null}
        {error ? <Text color="red">Error: {error}</Text> : null}

        {!isLoading && !error && skills.length === 0 ? (
          <Text dimColor>No declarative skills configured.</Text>
        ) : null}

        {!isLoading && !error
          ? skills.map((skill) => (
              <Box
                key={skill.identifier}
                flexDirection="column"
                marginBottom={1}>
                <Text color={skill.enabled ? "cyan" : undefined}>
                  {skill.enabled ? "●" : "○"} {skill.name}{" "}
                  <Text dimColor>({skill.identifier})</Text>
                </Text>
                <Text dimColor> {skill.description}</Text>
                <Text dimColor>
                  {" "}
                  scope:{skill.scope} · activation:{formatActivation(skill)} ·{" "}
                  {formatSignals(skill)}
                </Text>
                <Text dimColor> mention: @skill:{skill.identifier}</Text>
              </Box>
            ))
          : null}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Esc/q back</Text>
      </Box>
    </Box>
  );
}

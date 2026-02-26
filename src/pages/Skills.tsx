import { useState } from "react";
import type { SkillDefinition } from "../lib/types";
import SkillList from "../components/skills/SkillList";
import SkillEditor from "../components/skills/SkillEditor";

export default function Skills() {
  const [selectedSkill, setSelectedSkill] = useState<SkillDefinition | null>(
    null
  );
  const [showEditor, setShowEditor] = useState(false);

  const handleSelect = (skill: SkillDefinition) => {
    setSelectedSkill(skill);
    setShowEditor(true);
  };

  const handleCreate = () => {
    setSelectedSkill(null);
    setShowEditor(true);
  };

  const handleClose = () => {
    setSelectedSkill(null);
    setShowEditor(false);
  };

  return (
    <div className="h-full">
      <SkillList onSelect={handleSelect} onCreate={handleCreate} />

      {showEditor && (
        <SkillEditor
          skill={selectedSkill ?? undefined}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

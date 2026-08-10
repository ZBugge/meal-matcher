import { useState } from 'react';
import { mealsApi, ParsedRecipe } from '../api/client';

interface RecipePasteImportProps {
  onParsed: (recipe: ParsedRecipe) => void;
}

const recipeTemplate = `Title: Garlic Soup
Description: Creamy roasted garlic soup
Ingredients:
2 bulbs | garlic
4oz | milk
to taste | salt
Instructions:
Roast the garlic.
Blend and simmer.`;

export default function RecipePasteImport({ onParsed }: RecipePasteImportProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);

  const close = () => {
    setOpen(false);
    setText('');
    setError('');
  };

  const handleParse = async () => {
    if (!text.trim()) return;

    setParsing(true);
    setError('');
    try {
      const recipe = await mealsApi.parseRecipe(text);
      onParsed(recipe);
      close();
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Failed to parse recipe');
    } finally {
      setParsing(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-primary-300 bg-primary-50 px-4 py-3 text-sm font-medium text-primary-700 hover:bg-primary-100"
      >
        Paste a full recipe
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-primary-200 bg-primary-50 p-4 space-y-3">
      <div>
        <h4 className="font-semibold text-gray-900">Paste a full recipe</h4>
        <p className="text-sm text-gray-600 mt-1">
          Ask an LLM to use this exact format. Each ingredient must use
          {' '}<code>amount | ingredient</code>.
        </p>
      </div>

      <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-white p-3 text-xs text-gray-600 border border-gray-200">
        {recipeTemplate}
      </pre>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="input font-mono text-sm"
        rows={10}
        placeholder={recipeTemplate}
        aria-label="Recipe text to parse"
        autoFocus
      />

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={close} className="btn btn-secondary flex-1">
          Cancel paste
        </button>
        <button
          type="button"
          onClick={handleParse}
          disabled={!text.trim() || parsing}
          className="btn btn-primary flex-1"
        >
          {parsing ? 'Parsing…' : 'Fill recipe form'}
        </button>
      </div>
    </section>
  );
}

use crate::types::Context;

fn split_sentences(text: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut buffer = String::new();

    for ch in text.chars() {
        buffer.push(ch);
        if matches!(ch, '。' | '！' | '？' | '.' | '!' | '?' | '\n') {
            let sentence = buffer.trim();
            if !sentence.is_empty() {
                sentences.push(sentence.to_string());
            }
            buffer.clear();
        }
    }

    let tail = buffer.trim();
    if !tail.is_empty() {
        sentences.push(tail.to_string());
    }

    sentences
}

pub fn extract_context(full_text: &str, selection: &str) -> Context {
    let selection = selection.trim();
    if full_text.trim().is_empty() || selection.is_empty() {
        return Context::default();
    }

    if let Some(start_idx) = full_text.find(selection) {
        let end_idx = start_idx + selection.len();
        let before_text = &full_text[..start_idx];
        let after_text = &full_text[end_idx..];

        let before_sentences = split_sentences(before_text);
        let after_sentences = split_sentences(after_text);

        let before = before_sentences
            .iter()
            .rev()
            .take(2)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join(" ");

        let after = after_sentences
            .iter()
            .take(2)
            .cloned()
            .collect::<Vec<_>>()
            .join(" ");

        return Context { before, after };
    }

    Context::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_default_for_empty_inputs() {
        let context = extract_context("", "hello");
        assert_eq!(context.before, "");
        assert_eq!(context.after, "");
    }

    #[test]
    fn extracts_neighbor_sentences_around_selection() {
        let text = "第一句。第二句。选中文本。第三句。第四句。";
        let context = extract_context(text, "选中文本");

        assert_eq!(context.before, "第一句。 第二句。");
        assert_eq!(context.after, "。 第三句。");
    }
}

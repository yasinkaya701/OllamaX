src = open('/home/ubuntu/Krevyx/src/renderer/app.js').read()
needle = "];\n\n"
positions = [i for i in range(len(src)) if src[i:i+len(needle)] == needle]
print('occurrences of "];\\n\\n":', len(positions), positions)
for p in positions[:5]:
    print(p, repr(src[max(0,p-60):p+40]))
